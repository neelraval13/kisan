/* ----------------------------------------------------------------------------
   Updated ChatPage component – with streaming/typing effect
 --------------------------------------------------------------------------- */
'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Mic, Image as ImageIcon, Send, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* Tiny util to draw a live waveform on <canvas> */
function drawWave(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
  const ctx = canvas.getContext('2d')!;
  const data = new Uint8Array(analyser.fftSize);

  function loop() {
    requestAnimationFrame(loop);
    analyser.getByteTimeDomainData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * canvas.width;
      const y = (data[i] / 128) * (canvas.height / 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  loop();
}

const ChatPage: React.FC = () => {
  type Turn = { role: 'user' | 'bot'; text: string; isTyping?: boolean };

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);

  const userIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add this ref at the top with your other refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Add this auto-resize function
  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px'; // 128px = max-h-32
  };

  // Add this useEffect to handle initial sizing
  useEffect(() => {
    if (textareaRef.current) {
      autoResize(textareaRef.current);
    }
  }, [input]);

  /* first‑time uid */
  useEffect(() => {
    let id = localStorage.getItem('kisan_uid');
    if (!id) {
      id = uuid();
      localStorage.setItem('kisan_uid', id);
    }
    userIdRef.current = id;
  }, []);

  /* auto‑scroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  /* waveform animation */
  useEffect(() => {
    if (recording && canvasRef.current && analyserRef.current) {
      drawWave(canvasRef.current, analyserRef.current);
    }
  }, [recording]);

  /* check if there's content to send */
  const hasContent = (input.trim() || imageFile || audioBlob) && !sending;

  /* typing effect function */
  const typeMessage = (message: string, turnIndex: number) => {
    let currentIndex = 0;
    const typingSpeed = 15; // Decreased from 30ms to 15ms for faster typing

    const typeNextChar = () => {
      if (currentIndex <= message.length) {
        setTurns(prevTurns => 
          prevTurns.map((turn, index) => 
            index === turnIndex 
              ? { ...turn, text: message.slice(0, currentIndex), isTyping: currentIndex < message.length }
              : turn
          )
        );
        currentIndex++;
        
        if (currentIndex <= message.length) {
          typingTimeoutRef.current = setTimeout(typeNextChar, typingSpeed);
        }
      }
    };

    typeNextChar();
  };

  /* send message */
  const send = async () => {
    if (!hasContent || sending) return;

    setSending(true);
    
    // Store current values before clearing
    const currentInput = input.trim();
    const currentImageFile = imageFile;
    const currentAudioBlob = audioBlob;

    // Clear inputs immediately
    setInput('');
    setImageFile(null);
    setAudioBlob(null);

    // Step 1: Handle audio transcription first
    let finalMessage = currentInput;
    
    if (currentAudioBlob) {
      try {
        // Transcribe audio before sending to chat
        const transcribeForm = new FormData();
        transcribeForm.append('audio', currentAudioBlob, 'voice.webm');
        
        const transcribeRes = await fetch('/api/transcribe', {
          method: 'POST',
          body: transcribeForm
        });
        
        if (transcribeRes.ok) {
          const { text } = await transcribeRes.json();
          // Combine transcribed text with typed text
          finalMessage = finalMessage ? `${finalMessage} ${text}` : text;
          console.log('Transcribed audio:', text);
        } else {
          console.error('Transcription failed');
          const errorTurnIndex = turns.length + 1;
          setTurns((t) => [...t, { role: 'bot', text: '', isTyping: true }]);
          typeMessage('Sorry, I could not process your voice message.', errorTurnIndex);
          setSending(false);
          return;
        }
      } catch (error) {
        console.error('Transcription error:', error);
        const errorTurnIndex = turns.length + 1;
        setTurns((t) => [...t, { role: 'bot', text: '', isTyping: true }]);
        typeMessage('Sorry, I could not process your voice message.', errorTurnIndex);
        setSending(false);
        return;
      }
    }

    // Step 2: Check if we have any content after transcription
    if (!finalMessage.trim() && !currentImageFile) {
      console.log('No content to send after processing');
      setSending(false);
      return;
    }

    /* optimistic render user message */
    let display = finalMessage;
    if (currentAudioBlob) display = '🎤 ' + display;
    if (currentImageFile) display = '🖼️ [image attached] ' + display;
    setTurns((t) => [...t, { role: 'user', text: display }]);

    /* build form for chat API */
    const form = new FormData();
    form.append('userId', userIdRef.current);
    form.append('message', finalMessage);
    if (currentImageFile) form.append('image', currentImageFile);

    try {
      const res = await fetch('/api/chat', { method: 'POST', body: form });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Chat API Error:', errorData);
        
        // Add empty bot message and start typing error
        setTurns((t) => [...t, { role: 'bot', text: '', isTyping: true }]);
        const errorTurnIndex = turns.length + 1;
        typeMessage('Error: ' + (errorData.error || 'Something went wrong'), errorTurnIndex);
        setSending(false);
        return;
      }
      
      const { reply } = await res.json();
      
      // Add empty bot message and start typing the response
      setTurns((t) => [...t, { role: 'bot', text: '', isTyping: true }]);
      const botTurnIndex = turns.length + 1;
      typeMessage(reply, botTurnIndex);
      
    } catch (error) {
      console.error('Chat fetch error:', error);
      
      // Add empty bot message and start typing error
      setTurns((t) => [...t, { role: 'bot', text: '', isTyping: true }]);
      const errorTurnIndex = turns.length + 1;
      typeMessage('Network error occurred', errorTurnIndex);
    } finally {
      setSending(false);
    }
  };

  /* start voice capture */
  const startRec = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecRef.current = rec;
    const chunks: Blob[] = [];

    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      setAudioBlob(new Blob(chunks, { type: 'audio/webm' }));
    };

    /* waveform */
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    rec.start();
    setRecording(true);
  };

  const stopRec = () => mediaRecRef.current?.stop();

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  /* render */
  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      <div className="flex h-full w-full max-w-4xl mx-auto flex-col bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div className="border-b bg-white px-6 py-4 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-800">Kisan Chat</h1>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea ref={scrollRef} className="h-full px-4 py-4">
            <div className="space-y-4 w-full">
              {turns.length === 0 && !sending && (
                <div className="text-center text-gray-500 py-8">
                  <p>Start a conversation with Kisan AI</p>
                </div>
              )}
              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex w-full',
                    turn.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed overflow-hidden',
                      turn.role === 'user'
                        ? 'bg-green-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    )}
                  >
                    <div 
                      className="whitespace-pre-wrap break-words word-wrap overflow-wrap-anywhere"
                      style={{ 
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        hyphens: 'auto'
                      }}
                      dangerouslySetInnerHTML={{ 
                        __html: turn.text.replace(/\n/g, '<br/>') 
                      }}
                    />
                    {/* Removed the typing cursor completely */}
                  </div>
                </div>
              ))}
              
              {/* Loading dots when sending (before bot starts typing) */}
              {sending && (
                <div className="flex w-full justify-start">
                  <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-100 rounded-bl-md">
                    <div className="flex items-center space-x-1">
                      <div className="flex space-x-1">
                        <div 
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        ></div>
                        <div 
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        ></div>
                        <div 
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-4 flex-shrink-0">
          {/* File/Audio Previews */}
          {imageFile && (
            <div className="mb-3 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <img
                src={URL.createObjectURL(imageFile)}
                alt="preview"
                className="h-12 w-12 rounded object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">Image attached</p>
                <p className="text-xs text-gray-500 truncate">{imageFile.name}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImageFile(null)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {audioBlob && !recording && (
            <div className="mb-3 flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-700">🎤 Voice message ready</p>
                <p className="text-xs text-green-600">Will be sent with your message</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAudioBlob(null)}
                className="text-green-400 hover:text-green-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {recording && (
            <div className="mb-3 p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0"></div>
                <p className="text-sm font-medium text-red-700">Recording...</p>
              </div>
              <canvas 
                ref={canvasRef} 
                className="w-full h-8 bg-white rounded" 
              />
            </div>
          )}

          {/* Input Box */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full resize-none rounded-full border border-gray-300 py-3 pl-12 pr-24 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 min-h-[48px] max-h-32 overflow-y-auto leading-5"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              style={{ height: 'auto' }}
            />
            
            {/* Rest of your icons remain the same */}
            <input
              type="file"
              accept="image/*"
              hidden
              id="imgPick"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-gray-600 flex-shrink-0"
              onClick={() => document.getElementById('imgPick')!.click()}
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              {recording ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                  onClick={stopRec}
                >
                  <X className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-gray-400 hover:text-gray-600 flex-shrink-0"
                  onClick={startRec}
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}
              
              <Button
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-full flex-shrink-0",
                  hasContent 
                    ? "bg-green-600 hover:bg-green-700 text-white" 
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
                onClick={send}
                disabled={!hasContent}
              >
                {sending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;