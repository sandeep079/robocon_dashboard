import { useEffect, useRef, useState } from 'react';
import ROSLIB from 'roslib';

const canvasWidth = 800;
const canvasHeight = 600;

type Point = { x: number; y: number };

const GameField = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clickedPoints, setClickedPoints] = useState<Point[]>([]);
  const fieldImage = useRef<HTMLImageElement>(new Image());

  // Setup ROS connection
  useEffect(() => {
    const ros = new ROSLIB.Ros({
      url: 'ws://localhost:9090',
    });

    ros.on('connection', () => console.log('✅ Connected to ROS'));
    ros.on('error', (err) => console.error('❗ Connection error:', err));
    ros.on('close', () => console.log('❗ Connection closed'));

    const clickPublisher = new ROSLIB.Topic({
      ros,
      name: '/clicked_point',
      messageType: 'geometry_msgs/PointStamped',
    });

    const img = fieldImage.current;
    img.src = '/ROBOCON_2025.png'; // ✅ Make sure it's in the `public/` folder
    img.onload = () => draw();

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw all clicked points
      ctx.fillStyle = 'red';
      clickedPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const handleClick = (event: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Convert to real-world coordinates
      const realX = (x / canvasWidth) * 8; // meters
      const realY = (y / canvasHeight) * 6;

      console.log(`📍 Clicked at (X=${realX.toFixed(2)}m, Y=${realY.toFixed(2)}m)`);

      const now = Date.now();
      const message = new ROSLIB.Message({
        header: {
          frame_id: 'map',
          stamp: {
            secs: Math.floor(now / 1000),
            nsecs: (now % 1000) * 1e6,
          },
        },
        point: { x: realX, y: realY, z: 0 },
      });

      clickPublisher.publish(message);

      setClickedPoints((prev) => [...prev, { x, y }]);
    };

    const canvas = canvasRef.current;
    canvas?.addEventListener('click', handleClick);
    return () => {
      canvas?.removeEventListener('click', handleClick);
      ros.close();
    };
  }, [clickedPoints]);

  // Redraw whenever clickedPoints change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && fieldImage.current.complete) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(fieldImage.current, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'red';
      clickedPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [clickedPoints]);

  return (
    <div className="flex justify-center mt-6">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="border border-gray-400"
      ></canvas>
    </div>
  );
};

export default GameField;
