# KisanSahayak — WhatsApp Agricultural Assistant

KisanSahayak is a Flask-based WhatsApp chatbot built for farmers and agricultural ecosystems. It connects to Google Gemini for agronomy‑focused answers, image‑based disease checks, mandi price lookups, and details on government programs. The bot maintains dialogue context and supports multiple Indian languages.

## Key Capabilities

- **Agronomy expertise:** Focused guidance for crop production, protection, input management, and on‑farm practices.
- **Plant disease identification:** Analyze crop images and suggest likely issues with management options.
- **Market intelligence:** Current prices and trend context for major crops.
- **Government schemes:** Eligibility, benefits, and how to apply.
- **Voice handling:** Accepts audio messages and transcribes to text.
- **Multilingual operation:** Automatic translation for regional languages.
- **Embedded knowledge base:** Curated agriculture datasets.
- **Conversation memory:** Per‑farmer context to personalize follow‑ups.
- **WhatsApp Cloud API integration:** Reliable send/receive pipelines.
- **Secure webhooks:** HMAC signature verification.
- **Response quality checks:** Guards against corrupted or low‑quality AI output.

## Repository Layout

```
KisanSahayak/
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── config.py                # Configuration management
│   ├── views.py                 # Webhook endpoints
│   ├── decorators/
│   │   └── security.py          # Security decorators
│   ├── services/
│   │   ├── gemini_service.py    # Gemini AI integration for agricultural queries
│   │   ├── conversation_service.py # Conversation history management
│   │   ├── knowledge_base_service.py # Agricultural knowledge database
│   │   ├── prompt_manager.py    # Specialized agricultural prompts
│   │   ├── response_validator.py # Quality validation for farming advice
│   │   ├── translation_service.py # Multilingual support
│   │   ├── speech_service.py    # Speech-to-text processing
│   │   └── openai_service.py    # Alternative AI service
│   └── utils/
│       └── whatsapp_utils.py    # WhatsApp utilities and message processing
├── data/
│   ├── crop_diseases.json       # Crop disease database
│   ├── government_schemes.json  # Agricultural schemes and subsidies
│   ├── kisan_knowledge_base.json # Comprehensive farming knowledge
│   └── market_prices.json       # Market price information
├── start/                       # Quickstart examples and testing tools
├── debug_whatsapp.py            # API troubleshooting tool
├── run.py                       # Application entry point
├── requirements.txt             # Dependencies
├── .env.sample                  # Environment template
├── .gitignore                   # Git ignore rules
└── README.md                    # This file
```


## Setup

### Prerequisites

- Python 3.7+
- WhatsApp Business Cloud API access
- Google Gemini API key (OpenAI optional)
- ngrok for local tunneling
- `ffmpeg` for audio conversion (install from the official site)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/ayan2809/KisanSahayak.git
   cd KisanSahayak/AI
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Environment Configuration**
   Copy the sample environment file and configure it:
   ```bash
   cp .env.sample .env
   ```
   
   Edit the `.env` file with your credentials:
   ```env
   # WhatsApp Business API
   ACCESS_TOKEN=your_whatsapp_access_token
   PHONE_NUMBER_ID=your_phone_number_id
   VERIFY_TOKEN=your_verify_token
   VERSION=v18.0
   
   # AI Configuration
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-pro
   GEMINI_VISION_MODEL=gemini-pro-vision
   
   # Optional: OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_ASSISTANT_ID=your_assistant_id
   
   # Application Settings
   FLASK_ENV=development
   DEBUG=True
   ```

4. **Run the application**
   ```bash
   python run.py
   ```

5. **Test your setup**
   Use the debugging tool to verify your WhatsApp API configuration:
   ```bash
   python debug_whatsapp.py
   ```

## WhatsApp Business API Setup 📱

### 1. Create a Meta Developer Account
- Go to [Meta for Developers](https://developers.facebook.com/)
- Create a new app for WhatsApp Business

### 2. Configure Webhook
- Set webhook URL: `https://your-domain.com/webhook`
- Set verify token (same as in your `.env` file)
- Subscribe to `messages` webhook field

### 3. Get Required Tokens
- **Access Token**: From WhatsApp Business API settings
- **Phone Number ID**: From WhatsApp Business API settings
- **App Secret**: From App Settings > Basic

## AI Service Configuration 🧠

### Gemini AI for Agriculture (Default)
The bot uses Google's Gemini AI with specialized agricultural prompts and knowledge base:

1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add `GEMINI_API_KEY` to your `.env` file
3. The system uses specialized prompts for:
   - Crop disease identification
   - Agricultural best practices
   - Market price queries
   - Government scheme information
   - Weather-related farming advice

### Agricultural Knowledge Base
The bot includes comprehensive data for Indian agriculture:
- **Crop Diseases**: 500+ disease entries with symptoms and treatments
- **Government Schemes**: Latest agricultural subsidies and farmer benefits
- **Market Prices**: Real-time crop pricing information
- **Farming Knowledge**: Best practices, seasonal advice, and cultivation tips

### OpenAI (Alternative)
To use OpenAI instead:
1. Uncomment the OpenAI import in `whatsapp_utils.py`
2. Comment out the Gemini import
3. Set up OpenAI credentials in `.env`
4. Note: Agricultural specialization may require additional prompt engineering

### Speech-to-Text Configuration
The bot supports audio message processing with automatic format conversion:

1. **Google Cloud Speech** (recommended for best quality):
   - Enable Google Cloud Speech-to-Text API
   - Set up service account credentials
   - Supports OGG, WAV, FLAC formats directly

2. **SpeechRecognition** (free tier fallback):
   - Uses Google's free speech recognition service
   - Automatically converts audio formats using ffmpeg

3. **Audio Format Support**:
   - OGG (WhatsApp's default format)
   - WAV, FLAC, MP3
   - Automatic conversion for unsupported formats

## Debugging & Troubleshooting 🔧

### API Troubleshooting Tool
Use the built-in debugging script to test your WhatsApp API setup:

```bash
python debug_whatsapp.py
```

This tool will:
- ✅ Test API connectivity and permissions
- 🔑 Validate access tokens and scopes
- 📱 Verify phone number configuration
- 📤 Send test messages (optional)
- 🔍 Provide detailed error diagnostics

### Common Issues and Solutions
- **401 Unauthorized**: Token expired or invalid - generate new token
- **Missing scopes**: Ensure token has `whatsapp_business_messaging` permission
- **Audio processing errors**: Install ffmpeg for audio format conversion
- **Rate limiting**: Implement proper request throttling

## Features in Detail 🔍

### Agricultural Intelligence
- **Crop Advisory**: Specialized advice for different crops and farming stages
- **Disease Diagnosis**: AI-powered plant disease identification from images
- **Weather Integration**: Weather-aware farming recommendations
- **Seasonal Guidance**: Timely advice based on agricultural seasons
- **Soil Management**: Soil health and fertilizer recommendations

### Market Intelligence
- **Price Tracking**: Real-time market prices for various crops
- **Market Trends**: Historical price analysis and forecasting
- **Best Selling Times**: Optimal timing for crop sales
- **Regional Variations**: Location-specific market information

### Government Scheme Assistance
- **Scheme Discovery**: Find relevant government schemes for farmers
- **Eligibility Checking**: Determine qualification for various programs
- **Application Guidance**: Step-by-step application assistance
- **Subsidy Information**: Details about agricultural subsidies

### Conversation Memory & Personalization
- Stores farming history and preferences per user
- Maintains context across multiple conversations
- Personalized recommendations based on farmer's profile
- Tracks crop cycles and provides timely reminders

### Multilingual Support
- **Translation Services**: Automatic translation for regional languages
- **Voice Processing**: Speech-to-text in multiple Indian languages
- **Cultural Context**: Culturally appropriate farming advice
- **Local Terminology**: Uses region-specific agricultural terms

### Image Analysis for Agriculture
- **Crop Health Assessment**: Visual analysis of plant conditions
- **Disease Detection**: Automated identification of plant diseases
- **Nutrient Deficiency**: Detection of nutritional deficiencies in crops
- **Growth Stage Identification**: Determining crop maturity levels

### Quality Assurance
- **Response Validation**: Ensures agricultural advice accuracy
- **Knowledge Base Verification**: Cross-references with agricultural databases
- **Expert Review Integration**: Option for expert validation of critical advice
- **Continuous Learning**: Improves responses based on farmer feedback

## API Endpoints 🔗

### `GET /webhook`
Webhook verification endpoint for WhatsApp Business API

### `POST /webhook`
Receives incoming WhatsApp messages and processes them

## Development 💻

### Local Development with ngrok
```bash
# Install ngrok
# Run your Flask app
python run.py

# In another terminal, expose local server
ngrok http 8000

# Use the ngrok URL as your webhook URL in Meta Developer Console
```

### Testing Agricultural Features
The bot includes specialized quickstart examples:
- `gemini_quickstart.py` - Test agricultural AI integration
- `whatsapp_quickstart.py` - Test WhatsApp API
- `assistants_quickstart.py` - Test OpenAI Assistant

Test agricultural features:
```bash
# Test crop disease detection
python -c "from app.services.gemini_service import generate_response_with_image; print('Disease detection ready')"

# Test knowledge base
python -c "from app.services.knowledge_base_service import search_knowledge_base; print('Knowledge base loaded')"

# Test translation service
python -c "from app.services.translation_service import translation_service; print('Translation service ready')"
```

Use the debugging tool for comprehensive API testing:
```bash
python debug_whatsapp.py
```

## Deployment 🚀

### Production Considerations for Agricultural AI
- Use environment variables for all sensitive data
- Enable HTTPS for webhook endpoints
- Configure proper logging and monitoring for farming queries
- Set up error tracking and alerting for critical agricultural advice
- Use a production WSGI server (e.g., Gunicorn)
- Implement rate limiting for API calls
- Set up proper audio and image file cleanup
- Regular updates to agricultural knowledge base
- Backup conversation histories and farmer data
- Implement data privacy measures for farmer information

### Example Deployment Commands
```bash
# Using Gunicorn for production
gunicorn -w 4 -b 0.0.0.0:8000 run:app

# Using Docker (create Dockerfile)
docker build -t KisanSahayak-whatsapp .
docker run -p 8000:8000 KisanSahayak-whatsapp

# For high availability with agricultural data
gunicorn -w 4 -b 0.0.0.0:8000 --timeout 120 run:app
```

## Use Cases 🚜

### For Farmers
- **Crop Disease Identification**: "My tomato plants have yellow spots. What's wrong?"
- **Market Price Queries**: "What's the current price of wheat in Maharashtra?"
- **Government Scheme Information**: "Are there any subsidies for drip irrigation?"
- **Weather-Based Advice**: "Should I plant rice this week given the weather?"
- **Pest Management**: "How do I control aphids in my cotton crop?"

### For Agricultural Extension Workers
- **Quick Reference**: Access to comprehensive agricultural database
- **Visual Diagnosis**: Image-based crop problem identification
- **Scheme Updates**: Latest information on government programs
- **Multi-language Support**: Communicate with farmers in local languages

### For Agricultural Businesses
- **Market Intelligence**: Real-time crop price monitoring
- **Farmer Engagement**: Direct communication channel with farming community
- **Product Recommendations**: Context-aware agricultural product suggestions
- **Data Collection**: Insights into farming challenges and needs

## Supported Languages 🌐

- **Hindi** (हिंदी)
- **Marathi** (मराठी)
- **Gujarati** (ગુજરાતી)
- **Punjabi** (ਪੰਜਾਬੀ)
- **Bengali** (বাংলা)
- **Tamil** (தமிழ்)
- **Telugu** (తెలుగు)
- **Kannada** (ಕನ್ನಡ)
- **Malayalam** (മലയാളം)
- **English**

## Data Sources 📊

### Agricultural Knowledge Base
- **Crop Varieties**: 200+ crop varieties with cultivation details
- **Disease Database**: 500+ diseases with symptoms and treatments
- **Pest Information**: Common agricultural pests and control measures
- **Government Schemes**: Updated database of central and state schemes
- **Market Data**: Integration with agricultural market platforms
- **Weather Integration**: Connection with meteorological services

### Regional Customization
- State-specific crop recommendations
- Regional market price variations
- Local government scheme availability
- Climate-zone appropriate advice
- Traditional farming practice integration

## Contributing 🤝

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License 📄

This project is licensed under the MIT License - see the LICENSE file for details.

## Support 💬

For questions and support:
- Create an issue on GitHub
- Check the [WhatsApp Business API documentation](https://developers.facebook.com/docs/whatsapp)
- Review [Google Gemini AI documentation](https://ai.google.dev/docs)

## Acknowledgments 🙏

- Google for the Gemini AI API and agricultural AI capabilities
- Meta for the WhatsApp Business API
- Flask community for the excellent framework
- Indian Council of Agricultural Research (ICAR) for agricultural data
- State Agricultural Universities for regional knowledge
- Farmer communities for feedback and real-world testing
- Agricultural extension workers for domain expertise
- OpenAI for alternative AI integration options

---

**Note**: This agricultural AI assistant is designed to support farmers with information and advice. Always consult with local agricultural experts for critical farming decisions. The bot aims to democratize access to agricultural knowledge while respecting traditional farming wisdom and local practices.

## Getting Started for Farmers 👨‍🌾

### How to Use KisanSahayak
1. **Add the WhatsApp Number**: Save the bot's WhatsApp number to your contacts
2. **Send a Message**: Start with "Hi" or "नमस्ते" to begin conversation
3. **Ask Questions**: Use simple language to ask about farming topics
4. **Send Images**: Take photos of crops, diseases, or pests for analysis
5. **Voice Messages**: Speak in your preferred language for voice queries

### Sample Conversations

**Crop Disease Inquiry**:
```
Farmer: "My tomato plants have brown spots on leaves"
KisanSahayak: "This appears to be early blight disease. Here's what you can do:
🍅 Remove affected leaves immediately
💧 Reduce overhead watering
🌿 Apply copper-based fungicide
📅 Spray every 7-10 days until symptoms disappear"
```

**Market Price Query**:
```
Farmer: "wheat price today"
KisanSahayak: "Current wheat prices (MSP 2024-25):
🌾 Common Wheat: ₹2,275/quintal
🌾 Durum Wheat: ₹2,425/quintal
📍 Nearest mandi: Kharif Market, 15km
📈 Price trend: Stable (+2% from last month)"
```

**Government Scheme Information**:
```
Farmer: "subsidy for solar pump"
KisanSahayak: "Available solar pump subsidies:
☀️ PM-KUSUM Scheme: 60% subsidy
📋 Eligibility: All farmers with agricultural land
💰 Max subsidy: ₹4.8 lakh for 10 HP pump
📝 Apply at: Nearest agriculture office
📞 Helpline: 1800-180-1551"
```
