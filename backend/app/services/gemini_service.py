"""
Enhanced Gemini AI Service with translation support and response validation

Main AI service integrating Google's Gemini models to respond to farmers' queries.
"""

import os
import json
import shelve
import logging
import re
import string
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image
import google.generativeai as genai

# ---------------------------------------------------------------------
# Paths & configuration
# ---------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"

DATASET_PATH       = DATA_DIR / "kisan_knowledge_base.json"
CROP_DISEASES_PATH = DATA_DIR / "crop_diseases.json"
MARKET_DATA_PATH   = DATA_DIR / "market_prices.json"
SCHEMES_DATA_PATH  = DATA_DIR / "government_schemes.json"

# Our own services
from .translation_service import translation_service
# (You import these if/when you actually use them)
# from .conversation_service import conversation_service
# from .response_validator import response_validator
# from .prompt_manager import prompt_manager

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)
else:
    logging.warning("GEMINI_API_KEY not found in environment variables")

# Keep the same defaults you were using
GEMINI_MODEL        = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-1.5-pro")

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Heuristics & utilities
# ---------------------------------------------------------------------

EN_STOPWORDS = {
    "the","and","of","to","in","for","is","that","with","as","on","are",
    "this","it","you","your","can","be","or","if","from","at","by","use",
    "apply","remove","water","leaf","leaves","disease","spray","price",
    "tomato","spots","fungal","bacterial","copper","oil","mixture",
}

def is_probably_english(text: str) -> bool:
    """Heuristic: high ASCII + multiple English stopwords."""
    if not text:
        return False
    ascii_chars = sum(ch in string.printable for ch in text)
    ascii_ratio = ascii_chars / max(1, len(text))
    if ascii_ratio < 0.93:  # allow emojis/bullets
        return False
    tokens = re.findall(r"[A-Za-z']+", text.lower())
    if not tokens:
        return False
    hits = sum(t in EN_STOPWORDS for t in tokens)
    return hits >= 5


def validate_response_quality(response_text: str) -> bool:
    """Your corruption/garbling checks (kept mostly intact)."""
    if not response_text or len(response_text.strip()) < 10:
        return False

    words = response_text.split()
    if len(words) < 5:
        return True

    # repetition
    counts = {}
    for w in words:
        lw = w.lower()
        counts[lw] = counts.get(lw, 0) + 1
    if max(counts.values()) / len(words) > 0.2:
        logger.warning("Response rejected: excessive repetition")
        return False

    # script mixing patterns (Devanagari range)
    if re.search(r'[a-zA-Z][क-ह्][a-zA-Z]|[क-ह्][a-zA-Z][क-ह्]', response_text):
        logger.warning("Response rejected: corrupted script mixing (p1)")
        return False
    if re.search(r'[क-ह्][a-zA-Z][क-ह्]|[क-ह्][a-zA-Z]{1,2}[क-ह्]', response_text):
        logger.warning("Response rejected: corrupted script mixing (p2)")
        return False
    if re.search(r'\b[a-zA-Z]*[क-ह्]+[a-zA-Z]+[क-ह्]*\b|\b[क-ह्]*[a-zA-Z]+[क-ह्]+[a-zA-Z]*\b', response_text):
        logger.warning("Response rejected: corrupted script mixing (p3)")
        return False
    if re.search(r'[A-Z]{3,}.*[क-ह्].*[A-Z]{3,}', response_text):
        logger.warning("Response rejected: excessive uppercase/script mix")
        return False

    symbol_count = len(re.findall(r'[^\w\s\u0900-\u097F।,!?.\-()]', response_text))
    if symbol_count > len(response_text) * 0.08:
        logger.warning("Response rejected: excessive symbols")
        return False

    # corrupted word pattern
    corrupted = 0
    for w in words:
        if len(w) > 4 and re.search(r'^[a-z]+$', w):
            vowel_count = len(re.findall(r'[aeiou]', w.lower()))
            ratio = vowel_count / len(w)
            if ratio < 0.15 or ratio > 0.7:
                corrupted += 1
    if corrupted > len(words) * 0.3:
        logger.warning("Response rejected: too many corrupted words")
        return False

    if re.search(r'\b(\w+)(\s+\1){4,}\b', response_text):
        logger.warning("Response rejected: consecutive repetition")
        return False

    short_words = sum(1 for w in words if len(w) <= 2)
    if short_words > len(words) * 0.7:
        logger.warning("Response rejected: too fragmented")
        return False

    return True


def process_image(image_path: str):
    try:
        img = Image.open(image_path)
        if img.mode != "RGB":
            img = img.convert("RGB")
        return img
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return None


def get_conversation_history(wa_id: str):
    try:
        with shelve.open("conversations_db") as db:
            return db.get(wa_id, [])
    except Exception as e:
        logger.error(f"Error getting conversation history: {e}")
        return []


def save_conversation_history(wa_id: str, history: list):
    try:
        with shelve.open("conversations_db", writeback=True) as db:
            db[wa_id] = history[-20:]
    except Exception as e:
        logger.error(f"Error saving conversation history: {e}")


def load_custom_dataset() -> dict:
    kb = {}
    try:
        if DATASET_PATH.exists():
            kb["general"] = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
        if CROP_DISEASES_PATH.exists():
            kb["diseases"] = json.loads(CROP_DISEASES_PATH.read_text(encoding="utf-8"))
        if MARKET_DATA_PATH.exists():
            kb["market"] = json.loads(MARKET_DATA_PATH.read_text(encoding="utf-8"))
        if SCHEMES_DATA_PATH.exists():
            kb["schemes"] = json.loads(SCHEMES_DATA_PATH.read_text(encoding="utf-8"))
        logger.info("Custom dataset loaded successfully")
    except Exception as e:
        logger.error(f"Error loading custom dataset: {e}")
    return kb


def chunk_translate_to_english(text: str, src_lang: str) -> str:
    """
    Chunk translations to avoid provider limits. If translation fails
    or collapses to a tiny string, return the original.
    """
    try:
        chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
        out = []
        for c in chunks:
            out.append(translation_service.translate_to_english(c, src_lang))
        joined = "\n".join(out)
        if len(joined) < max(200, int(len(text) * 0.3)):
            return text
        return joined
    except Exception:
        return text

# ---------------------------------------------------------------------
# Public generators
# ---------------------------------------------------------------------

def generate_response(message_body: str, wa_id: str, name: str) -> str:
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        history = get_conversation_history(wa_id)

        system_prompt = (
            f"You are a helpful WhatsApp assistant chatting with {name}. "
            f"Keep responses concise and friendly."
        )

        if not history:
            history = [
                {"role": "user",  "parts": [system_prompt]},
                {"role": "model", "parts": ["Hello! How can I help you today? 😊"]},
            ]

        chat = model.start_chat(history=history)
        resp = chat.send_message(message_body)
        bot = resp.text or "Sorry, I'm having trouble responding right now."

        history.append({"role": "user",  "parts": [message_body]})
        history.append({"role": "model", "parts": [bot]})
        save_conversation_history(wa_id, history)

        logger.info(f"Generated response for {name}")
        return bot
    except Exception as e:
        logger.error(f"Error generating response: {e}")
        return "Sorry, I'm having trouble responding right now. Please try again later."


def generate_response_with_context(message_body: str, wa_id: str, name: str, context_file: str | None = None) -> str:
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        history = get_conversation_history(wa_id)

        system_prompt = (
            f"You are a helpful WhatsApp assistant chatting with {name}. "
            f"Keep responses concise and friendly."
        )

        if context_file and os.path.exists(context_file):
            try:
                content = Path(context_file).read_text(encoding="utf-8")[:2000]
                system_prompt += f"\n\nContext from file:\n{content}"
            except Exception as e:
                logger.warning(f"Could not read context file: {e}")

        if not history:
            history = [
                {"role": "user",  "parts": [system_prompt]},
                {"role": "model", "parts": ["Hello! How can I help you today? 😊"]},
            ]

        chat = model.start_chat(history=history)
        resp = chat.send_message(message_body)
        bot = resp.text or "Sorry, I'm having trouble responding right now."

        history.append({"role": "user",  "parts": [message_body]})
        history.append({"role": "model", "parts": [bot]})
        save_conversation_history(wa_id, history)

        logger.info(f"Generated response with context for {name}")
        return bot
    except Exception as e:
        logger.error(f"Error generating response with context: {e}")
        return "Sorry, I'm having trouble responding right now. Please try again later."


def generate_response_with_image(message_body: str, wa_id: str, name: str, image_path: str | None = None) -> str:
    """If image provided, use vision model; otherwise fall back to text chat."""
    try:
        model_name = GEMINI_VISION_MODEL if image_path else GEMINI_MODEL
        model = genai.GenerativeModel(model_name)
        history = get_conversation_history(wa_id)

        content_parts = []
        if message_body:
            content_parts.append(message_body)

        if image_path and os.path.exists(image_path):
            img = process_image(image_path)
            if img:
                content_parts.append(img)
                logger.info(f"Added image for analysis: {image_path}")

        if not content_parts:
            return "I couldn't process your message. Please try again."

        if image_path:
            resp = model.generate_content(content_parts)
            bot_text = resp.text or ""
        else:
            if not history:
                system_prompt = (
                    f"You are a helpful WhatsApp assistant chatting with {name}. "
                    f"Keep responses concise and friendly."
                )
                history = [
                    {"role": "user",  "parts": [system_prompt]},
                    {"role": "model", "parts": ["Hello! How can I help you today? 😊"]},
                ]
            chat = model.start_chat(history=history)
            resp = chat.send_message(message_body)
            bot_text = resp.text or ""

        # Language handling similar to Kisan path
        det = translation_service.detect_language(message_body) or "en"
        if re.search(r"[\u0900-\u097F]", message_body):
            det = "hi"

        resp_lang = translation_service.detect_language(bot_text) or "en"
        if re.search(r"[\u0900-\u097F]", bot_text):
            resp_lang = "hi"
        elif is_probably_english(bot_text):
            resp_lang = "en"

        if resp_lang == det or resp_lang == "en":
            final = bot_text
        else:
            eng = bot_text if resp_lang == "en" else chunk_translate_to_english(bot_text, resp_lang)
            if not validate_response_quality(eng):
                eng = "I can help with farming advice and market prices. Please share crop, symptoms, and location."
            final = eng if det == "en" else translation_service.translate_response(eng, det)

        # Safety: never shrink a long answer to a tiny stub
        if len(final) < 100 and len(bot_text) > 800:
            final = bot_text

        history.append({"role": "user",  "parts": [message_body]})
        history.append({"role": "model", "parts": [final]})
        save_conversation_history(wa_id, history)

        logger.info(f"Generated response for {name}")
        return final
    except Exception as e:
        logger.error(f"Error generating response with image: {e}")
        return "Sorry, I'm having trouble analyzing the image. Please try again later."


def clear_conversation_history(wa_id: str):
    try:
        with shelve.open("conversations_db", writeback=True) as db:
            if wa_id in db:
                del db[wa_id]
                logger.info(f"Cleared conversation history for {wa_id}")
    except Exception as e:
        logger.error(f"Error clearing conversation history: {e}")


def check_if_conversation_exists(wa_id: str) -> bool:
    try:
        with shelve.open("conversations_db") as db:
            return wa_id in db
    except Exception as e:
        logger.error(f"Error checking conversation existence: {e}")
        return False


def generate_kisan_response(message_body: str, wa_id: str, farmer_name: str) -> str:
    """
    Main Kisan Sahayak path with multilingual support and KB grounding.
    Avoids collapsing long Gemini replies due to translation mis-detection.
    """
    try:
        # Detect user language
        det = translation_service.detect_language(message_body) or "en"
        if re.search(r"[\u0900-\u097F]", message_body):
            det = "hi"

        # Translate incoming to English if needed (fail-safe to original)
        if det != "en":
            try:
                english_msg = translation_service.translate_message(message_body)["english_text"]
            except Exception:
                logger.error("Incoming translation failed; using original text")
                english_msg = message_body
        else:
            english_msg = message_body

        logger.info(f"Processing message from {farmer_name}: '{english_msg[:50]}...' (detected: {det})")

        # Greeting shortcut
        if english_msg.strip().lower() == "hello":
            base = (
                f"Hello {farmer_name}! 🙏 I am Kisan Sahayak, your farming assistant. "
                f"I can help with market prices, crop advice, and schemes. How can I assist you today?"
            )
            return base if det == "en" else translation_service.translate_response(base, det)

        # Custom price shortcut
        if "cucumber" in english_msg.lower() and "pune" in english_msg.lower():
            kb_market = load_custom_dataset().get("market", {})
            recs = kb_market.get("records", [])
            prices = [
                r.get("modal_price")
                for r in recs
                if r.get("commodity", "").strip().lower() == "cucumber"
                and r.get("market", "").strip().lower() == "pune"
            ]
            if prices:
                resp = f"The latest modal price of cucumbers in Pune is ₹{prices[-1]} per quintal."
            else:
                resp = "Sorry, I couldn't find the latest cucumber price for Pune."
            return resp if det == "en" else translation_service.translate_response(resp, det)

        # Load KB and history
        kb = load_custom_dataset()
        history = get_conversation_history(wa_id)

        kb_snippet = json.dumps(kb, ensure_ascii=False, indent=2)[:3000]
        system_prompt = (
            "You are Kisan Sahayak, an AI assistant for Indian farmers.\n"
            "Core principles:\n"
            "- Provide accurate, practical farming advice\n"
            "- Include specific market prices when available\n"
            "- Mention relevant government schemes when applicable\n"
            "- Be concise but thorough and respectful\n\n"
            f"Knowledge Base (truncated):\n{kb_snippet}\n\n"
            f"Farmer: {farmer_name}\n"
            f"Query: {english_msg}\n"
            "Respond in clear, practical terms."
        )

        # Clean prior history of system-like messages
        clean_history = []
        for msg in (history or []):
            msg_text = str(msg.get("parts", [""])[0]).lower()
            if not any(x in msg_text for x in ["you are kisan", "core principles", "knowledge base", "respond in"]):
                clean_history.append(msg)

        model = genai.GenerativeModel(GEMINI_MODEL)
        if clean_history:
            chat = model.start_chat(history=clean_history)
            result = chat.send_message(system_prompt)
        else:
            result = model.generate_content(system_prompt)

        bot_text = (result.text or "").strip()
        logger.info(f"Generated model response: '{bot_text[:100]}...'")

        # Language detection for model response
        resp_lang = translation_service.detect_language(bot_text) or "en"
        if re.search(r"[\u0900-\u097F]", bot_text):
            resp_lang = "hi"
        elif is_probably_english(bot_text):
            resp_lang = "en"

        # Decide whether to translate
        if resp_lang == det or resp_lang == "en":
            final = bot_text
        else:
            eng = bot_text if resp_lang == "en" else chunk_translate_to_english(bot_text, resp_lang)
            if not validate_response_quality(eng):
                eng = (
                    "I can help with farming questions, market prices, and crop advice. "
                    "Please share crop name, symptoms, location, and recent weather."
                )
            final = eng if det == "en" else translation_service.translate_response(eng, det)

        # Final safety: never collapse a long answer to a tiny stub
        if len(final) < 100 and len(bot_text) > 800:
            final = bot_text

        # Save history
        clean_history.append({"role": "user",  "parts": [message_body]})
        clean_history.append({"role": "model", "parts": [final]})
        save_conversation_history(wa_id, clean_history)

        logger.info(f"Generated Kisan response for {farmer_name} in {det}")
        return final

    except Exception as e:
        logger.error(f"Error generating Kisan response: {e}")
        fallback = "Sorry, I'm having trouble responding right now. Please try again later."
        try:
            return fallback if det == "en" else translation_service.translate_response(fallback, det)
        except Exception:
            return "क्षमा करें, मुझे अभी जवाब देने में समस्या हो रही है। कृपया थोड़ी देर बाद कोशिश करें।"
