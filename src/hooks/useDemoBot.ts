import { useEffect, useRef, useState } from 'react';
import type { TestAction, TestInput } from '../game/types';

export const BOT_SPEEDS = [
  { value: 1500, label: 'Chậm' },
  { value: 700, label: 'Vừa' },
  { value: 250, label: 'Nhanh' }
];

export function pickWeighted(actions: TestAction[], random: () => number = Math.random): TestAction | null {
  const total = actions.reduce((sum, action) => sum + (action.weight ?? 1), 0);
  let roll = random() * total;
  for (const action of actions) {
    roll -= action.weight ?? 1;
    if (roll <= 0) return action;
  }
  return actions[actions.length - 1] ?? null;
}

/** Demo bot: while enabled and a round runs, plays random test actions as viewers. */
export function useDemoBot(actions: TestAction[], onTest: (input: TestInput) => void, running: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [speed, setSpeed] = useState(700);
  const latest = useRef({ actions, onTest });

  useEffect(() => {
    latest.current = { actions, onTest };
  });

  useEffect(() => {
    if (!enabled || !running) return undefined;
    const timer = setInterval(() => {
      const action = pickWeighted(latest.current.actions);
      if (action) latest.current.onTest(action.input);
    }, speed);
    return () => clearInterval(timer);
  }, [enabled, running, speed]);

  return { enabled, setEnabled, speed, setSpeed };
}

export type DemoBot = ReturnType<typeof useDemoBot>;
