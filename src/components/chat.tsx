'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

type Turn = { role: 'user' | 'bot'; text: string };

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const userIdRef = useRef('');

  // one-time: create / get anon id
  useEffect(() => {
    let id = localStorage.getItem('kisan_uid');
    if (!id) {
      id = uuid();
      localStorage.setItem('kisan_uid', id);
    }
    userIdRef.current = id;
  }, []);

  async function send() {
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
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      {/* chat log */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-xl px-4 py-2 max-w-prose ${
              t.role === 'user'
                ? 'bg-green-600 text-white self-end'
                : 'bg-gray-200'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* input row */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-4 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about your crops…"
        />
        <button
          onClick={send}
          className="bg-green-700 text-white px-4 py-2 rounded-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
}