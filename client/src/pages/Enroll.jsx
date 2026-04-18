import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from '../components/Webcam';
import { enrollFace } from '../lib/api';
import { extractFaceEmbedding, getDemoEmbedding, isDemoQueryEnabled } from '../lib/face';

export default function EnrollPage({ app }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const demoQueryEnabled = isDemoQueryEnabled();

  async function handleEnroll(videoElement) {
    const embedding = demoQueryEnabled ? getDemoEmbedding() : await extractFaceEmbedding(videoElement);
    await enrollFace({ embedding });
    await app.refreshMe();
    setMessage('Face enrolled. Redirecting to files...');
    navigate('/files', { replace: true });
  }

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <div className="brand-mark">Mirage</div>
          <h1>Face enrollment</h1>
          <p>Complete a one-time enrollment to finish setting up your workspace.</p>
        </div>
      </header>

      <Webcam
        title="Capture enrollment sample"
        description="Center your face in frame and capture a clear image in steady lighting."
        actionLabel="Capture face"
        busyLabel="Saving..."
        onCapture={handleEnroll}
      />

      {message ? <p className="status-success centered-status">{message}</p> : null}
    </div>
  );
}
