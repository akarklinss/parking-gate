import { useEffect, useRef, useState } from 'react';
import { anprProviders } from '../services/anpr.js';

export default function CameraPanel({ providerId, onPlate }) {
  const videoRef = useRef(null), frameRef = useRef(null), previewRef = useRef(null), streamRef = useRef(null);
  const [status, setStatus] = useState('Kamera nav ieslēgta.');
  const [running, setRunning] = useState(false), [busy, setBusy] = useState(false);

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);

  const start = async () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    streamRef.current = stream; videoRef.current.srcObject = stream; await videoRef.current.play(); setRunning(true); setStatus('Novieto numurzīmi baltajā rāmī.');
  };

  const scan = async () => {
    if (!running) return;
    setBusy(true); setStatus('Meklē numurzīmi…');
    try {
      const video = videoRef.current, canvas = frameRef.current;
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const provider = anprProviders[providerId] || anprProviders.browser;
      const result = await provider.recognize(canvas, previewRef.current, p => setStatus(`Nolasa… ${p}%`));
      if (!result.plate) setStatus('Numuru neizdevās droši nolasīt. Izlabo manuāli.');
      else { onPlate(result.plate, 'OCR'); setStatus(`Nolasīts: ${result.plate}. Pārbaudi pirms apstiprināšanas.`); }
    } catch (error) { setStatus(`Kļūda: ${error.message}`); }
    finally { setBusy(false); }
  };

  return <section className="card camera-card">
    <div className="camera-stage"><video ref={videoRef} playsInline muted autoPlay/><div className="plate-frame"/><canvas ref={frameRef} hidden/></div>
    <div className="two-col"><button onClick={start}>📷 Sākt kameru</button><button className="accent" disabled={!running || busy} onClick={scan}>{busy ? 'Nolasa…' : 'Nolasīt numuru'}</button></div>
    <p className="muted">{status}</p>
    <canvas ref={previewRef} className="plate-preview"/>
  </section>;
}
