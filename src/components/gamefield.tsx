import { useEffect, useRef, useState } from 'react';
import ROSLIB from 'roslib';

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 700;
const FIELD_WIDTH = 15.0; // meters
const FIELD_HEIGHT = 8.0; // meters
const GRID_SPACING = 1.0; // meters

// URDF Field Elements
const FIELD_ELEMENTS = [
  // Field boundary (collision box)
  {
    type: 'rectangle',
    position: { x: 7.5, y: 4.0 }, // Center of field
    dimensions: { width: 15.0, height: 8.0 },
    color: 'rgba(200, 200, 200, 0.2)'
  },
  // Left goal
  {
    type: 'rectangle', 
    position: { x: 0.5, y: 4.0 },
    dimensions: { width: 1.0, height: 3.0 },
    color: 'rgba(255, 0, 0, 0.5)'
  },
  // Right goal
  {
    type: 'rectangle',
    position: { x: 14.5, y: 4.0 },
    dimensions: { width: 1.0, height: 3.0 },
    color: 'rgba(0, 0, 255, 0.5)'
  },
  // Center line
  {
    type: 'line',
    position: { x: 7.5, y: 0 },
    dimensions: { width: 0.1, height: 8.0 },
    color: 'rgba(255, 255, 255, 0.8)'
  }
];

const GameField = () => {
  // Refs and state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPoint, setCurrentPoint] = useState<{x: number, y: number} | null>(null);
  const [rosStatus, setRosStatus] = useState('Disconnected');
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const clickedPointsTopicRef = useRef<ROSLIB.Topic | null>(null);
  const dashboardCoordsTopicRef = useRef<ROSLIB.Topic | null>(null);

  // Convert canvas pixels to meters (top-right origin)
  const pixelToMeter = (px: number, py: number) => ({
    x: ((CANVAS_WIDTH - px) / CANVAS_WIDTH) * FIELD_WIDTH,
    y: (py / CANVAS_HEIGHT) * FIELD_HEIGHT
  });

  // Convert meters to canvas pixels
  const meterToPixel = (mx: number, my: number) => ({
    x: CANVAS_WIDTH - (mx / FIELD_WIDTH) * CANVAS_WIDTH,
    y: (my / FIELD_HEIGHT) * CANVAS_HEIGHT
  });

  // Initialize ROS connection and topics
  useEffect(() => {
    const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
    rosRef.current = ros;

    ros.on('connection', () => {
      console.log('✅ ROS connected');
      setRosStatus('Connected');
      
      // Initialize /clicked_points topic (PointStamped)
      clickedPointsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/clicked_points',
        messageType: 'geometry_msgs/PointStamped'
      });

      // Initialize and advertise /dashboard_coords topic (Point)
      dashboardCoordsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/dashboard_coords',
        messageType: 'geometry_msgs/msg/Point'
      });
      dashboardCoordsTopicRef.current.advertise();
      console.log('✅ Advertised /dashboard_coords topic');
    });

    ros.on('error', (error) => {
      console.error('❌ ROS connection error:', error);
      setRosStatus(`Error: ${error.message}`);
    });

    ros.on('close', () => {
      console.log('⚠️ ROS connection closed');
      setRosStatus('Disconnected');
    });

    return () => {
      if (ros.isConnected) {
        if (dashboardCoordsTopicRef.current) {
          dashboardCoordsTopicRef.current.unadvertise();
          console.log('❌ Unadvertised /dashboard_coords topic');
        }
        ros.close();
      }
    };
  }, []);

  // Publish to /dashboard_coords topic
  const publishDashboardCoords = (x: number, y: number) => {
    if (!dashboardCoordsTopicRef.current) {
      console.error('Dashboard coords topic not initialized');
      return;
    }

    const point = new ROSLIB.Message({
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      z: 0.0
    });
    
    dashboardCoordsTopicRef.current.publish(point);
    console.log(`Published to /dashboard_coords: (${x.toFixed(2)}, ${y.toFixed(2)})`);
  };

  // Handle canvas clicks
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    
    const {x, y} = pixelToMeter(pixelX, pixelY);
    const newPoint = {x, y};
    setCurrentPoint(newPoint);
    
    // Publish to both topics
    publishDashboardCoords(x, y);
    
    if (clickedPointsTopicRef.current) {
      const now = new Date();
      const timestamp = {
        secs: Math.floor(now.getTime() / 1000),
        nsecs: (now.getTime() % 1000) * 1000000
      };
      
      const msg = new ROSLIB.Message({
        header: { 
          stamp: timestamp,
          frame_id: 'map' 
        },
        point: { x, y, z: 0 }
      });
      
      clickedPointsTopicRef.current.publish(msg);
      
      console.groupCollapsed(`📌 Published point to ROS`);
      console.log('📋 Message:', msg);
      console.log('📍 Coordinates:', { x, y });
      console.log('⏱️ Timestamp:', `${timestamp.secs}.${timestamp.nsecs.toString().padStart(9, '0')}`);
      console.log('📡 Topic:', clickedPointsTopicRef.current.name);
      console.groupEnd();
    }
  };

  // Clear the point
  const clearPoint = () => {
    setCurrentPoint(null);
    console.log('🧹 Cleared point');
  };

  // Draw field elements
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.font = '10px Arial';
    ctx.fillStyle = 'green';
    
    // Vertical grid lines
    for (let x = 0; x <= FIELD_WIDTH; x += GRID_SPACING) {
      const px = meterToPixel(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.fillText(`${x}m`, px + 5, 15);
    }
    
    // Horizontal grid lines
    for (let y = 0; y <= FIELD_HEIGHT; y += GRID_SPACING) {
      const py = meterToPixel(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(CANVAS_WIDTH, py);
      ctx.stroke();
      ctx.fillText(`${y}m`, CANVAS_WIDTH - 30, py + 15);
    }

    // Draw URDF elements
    FIELD_ELEMENTS.forEach(element => {
      const pos = meterToPixel(element.position.x, element.position.y);
      
      if (element.type === 'rectangle') {
        const dims = element.dimensions as {width: number, height: number};
        const width = (dims.width / FIELD_WIDTH) * CANVAS_WIDTH;
        const height = (dims.height / FIELD_HEIGHT) * CANVAS_HEIGHT;
        
        ctx.fillStyle = element.color;
        ctx.fillRect(pos.x - width/2, pos.y - height/2, width, height);
      }
      else if (element.type === 'line') {
        const dims = element.dimensions as {width: number, height: number};
        const width = (dims.width / FIELD_WIDTH) * CANVAS_WIDTH;
        const height = (dims.height / FIELD_HEIGHT) * CANVAS_HEIGHT;
        
        ctx.strokeStyle = element.color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x, pos.y + height);
        ctx.stroke();
      }
    });

    // Draw current point (if exists)
    if (currentPoint) {
      ctx.fillStyle = 'red';
      const pos = meterToPixel(currentPoint.x, currentPoint.y);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(
        `Current: (${currentPoint.x.toFixed(2)}m, ${currentPoint.y.toFixed(2)}m)`,
        pos.x - 100,
        pos.y + 20
      );
    }

    // Draw origin marker (top-right)
    ctx.fillStyle = 'lime';
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('Origin (0,0)', CANVAS_WIDTH - 80, 15);
  }, [currentPoint]);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>Field Coordinates (Top-Right Origin)</h2>
      <p>X increases rightward (positive), Y increases downward (positive)</p>
      
      <div style={{ 
        marginBottom: '10px',
        padding: '10px',
        background: rosStatus === 'Connected' ? '#e6f7e6' : '#ffe6e6',
        borderRadius: '5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <strong>ROS Status:</strong> 
          <span style={{ color: rosStatus === 'Connected' ? 'green' : 'red', marginLeft: '10px' }}>
            {rosStatus}
          </span>
        </div>
        <button 
          onClick={clearPoint}
          style={{
            padding: '5px 10px',
            background: '#ff4444',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Clear Point
        </button>
      </div>
      
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onClick={handleClick}
        style={{
          border: '2px solid #333',
          background: '#222',
          marginBottom: '10px',
          cursor: 'crosshair'
        }}
      />
      
      <div style={{ background: '#f5f5f5', padding: '10px', borderRadius: '5px' }}>
        <h3>Current Point:</h3>
        {currentPoint ? (
          <p>
            <strong>Coordinates:</strong> ({currentPoint.x.toFixed(2)}m, {currentPoint.y.toFixed(2)}m)
          </p>
        ) : (
          <p>Click on the field to add a point (check browser console for ROS output)</p>
        )}
      </div>
    </div>
  );
};

export default GameField;