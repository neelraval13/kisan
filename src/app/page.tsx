'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Turn = { role: 'user' | 'bot'; text: string };

const ChatPage = () => {
  /* ─────────────────── state & refs ─────────────────── */
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);

  const userIdRef   = useRef('');
  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileInput   = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  /* one-time anonymous uid */
  useEffect(() => {
    let id = localStorage.getItem('kisan_uid');
    if (!id) {
      id = uuid();
      localStorage.setItem('kisan_uid', id);
    }
    userIdRef.current = id;
  }, []);

  /* auto-scroll on new turn */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  /* ─────────────────── helpers ─────────────────── */

  /** send a text prompt (from input or override) */
  const sendText = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt) return;

    setTurns((t) => [...t, { role: 'user', text: prompt }]);
    setInput('');

    const res  = await fetch('/api/chat', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ userId: userIdRef.current, message: prompt }),
    });
    const { reply } = await res.json();
    setTurns((t) => [...t, { role: 'bot', text: reply }]);
  };

  /** upload image and get diagnosis */
  const sendImage = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setTurns((t) => [...t, { role: 'user', text: '🖼️ [image uploaded]' }]);

    const form = new FormData();
    form.append('image', file, file.name);

    const res = await fetch('/api/analyze-image', { method: 'POST', body: form });
    const { answer } = await res.json();

    setTurns((t) => [...t, { role: 'bot', text: answer }]);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  /** start voice recording */
  const startRec = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec    = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);

    rec.onstop = async () => {
      setRecording(false);

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (blob.size < 1024) return; // skip empty

      setTurns((t) => [...t, { role: 'user', text: '🎤 [voice message]' }]);

      const form = new FormData();
      form.append('audio', blob, 'voice.webm');

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const { text } = await res.json();

      if (text) {
        await sendText(text);   // reuse normal flow
      } else {
        setTurns((t) => [...t, { role: 'bot', text: 'Could not transcribe audio.' }]);
      }
    };

    rec.start();
    setRecording(true);
  };

  const stopRec = () => mediaRecRef.current?.stop();

  /* ─────────────────── render ─────────────────── */
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
      <Card className="flex h-full w-full max-w-2xl flex-col">
        <CardContent className="flex h-full flex-col p-0">
          {/* chat log */}
          <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap rounded-xl px-4 py-2 max-w-prose',
                    t.role === 'user'
                      ? 'ml-auto bg-green-600 text-white'
                      : 'mr-auto bg-gray-200'
                  )}
                  dangerouslySetInnerHTML={{ __html: t.text.replace(/\n/g, '<br/>') }}
                />
              ))}
            </div>
          </ScrollArea>

          {/* text input row */}
          <div className="flex gap-2 border-t p-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendText()}
              placeholder="Ask about your crops…"
            />
            <Button onClick={() => sendText()}>Send</Button>
          </div>

          {/* image upload + voice row */}
          <div className="flex flex-wrap items-center gap-2 border-t px-4 pb-4">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="flex-1 text-sm"
            />
            <Button onClick={sendImage} disabled={uploading}>
              {uploading ? 'Analyzing…' : 'Send photo'}
            </Button>

            <Button
              variant={recording ? 'destructive' : 'outline'}
              onClick={recording ? stopRec : startRec}
            >
              {recording ? 'Stop' : '🎤 Record'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPage;