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
  const userIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* one-time anon id */
  useEffect(() => {
    let id = localStorage.getItem('kisan_uid');
    if (!id) {
      id = uuid();
      localStorage.setItem('kisan_uid', id);
    }
    userIdRef.current = id;
  }, []);

  /* auto-scroll on new message */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  /* ─────────────────── text prompt handler ─────────────────── */
  const sendText = async () => {
    const prompt = input.trim();
    if (!prompt) return;

    setTurns((t) => [...t, { role: 'user', text: prompt }]);
    setInput('');

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userIdRef.current, message: prompt }),
    });
    const { reply } = await res.json();
    setTurns((t) => [...t, { role: 'bot', text: reply }]);
  };

  /* ─────────────────── image upload handler ─────────────────── */
  const sendImage = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setTurns((t) => [...t, { role: 'user', text: '[🖼️ image uploaded]' }]);

    const form = new FormData();
    form.append('image', file);

    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      body: form,
    });
    const { answer } = await res.json();

    setTurns((t) => [...t, { role: 'bot', text: answer }]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
                      : 'mr-auto bg-gray-200',
                  )}
                  dangerouslySetInnerHTML={{
                    __html: t.text.replace(/\n/g, '<br/>'),
                  }}
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
            <Button onClick={sendText}>Send</Button>
          </div>

          {/* image upload row */}
          <div className="flex items-center gap-2 border-t px-4 pb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="flex-1 text-sm"
            />
            <Button onClick={sendImage} disabled={uploading}>
              {uploading ? 'Analyzing…' : 'Send photo'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPage;