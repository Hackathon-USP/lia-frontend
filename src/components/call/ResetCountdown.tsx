import { useEffect, useState } from "react";

export function ResetCountdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const deadline = Date.now() + seconds * 1000;
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return <span className="font-bold tabular-nums">{remaining} segundos</span>;
}
