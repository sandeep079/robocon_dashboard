import { useEffect, useRef, useState, useCallback } from 'react';
import ROSLIB from 'roslib';

// Responsive canvas dimensions
const getCanvasDimensions = () => ({
  width: Math.min(window.innerWidth - 40, 800),
  height: Math.min(window.innerHeight * 0.6, 700)
});

// Field constants
const FIELD_WIDTH = 15.0; // meters
const FIELD_HEIGHT = 8.0; // meters
const GRID_SPACING = 1.0; // meters

// URDF Field Elements
const FIELD_ELEMENTS = [
  {
    type: 'rectangle',
    position: { x: 7.5, y: 4.0 },
    dimensions: { width: 15.0, height: 8.0 },
    color: 'rgba(200, 200, 200, 0.2)'
  },
  {
    type: 'rectangle', 
    position: { x: 0.5, y: 4.0 },
    dimensions: { width: 1.0, height: 3.0 },
    color: 'rgba(255, 0, 0, 0.5)'
  },
  {
    type: 'rectangle',
    position: { x: 14.5, y: 4.0 },
    dimensions: { width: 1.0, height: 3.0 },
    color: 'rgba(0, 0, 255, 0.5)'
  },
  {
    type: 'line',
    position: { x: 7.5, y: 0 },
    dimensions: { width: 0.1, height: 8.0 },
    color: 'rgba(255, 255, 255, 0.8)'
  }
];

const GameField = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState(getCanvasDimensions());
  const [currentPoint, setCurrentPoint] = useState<{x: number, y: number} | null>(null);
  const [rosStatus, setRosStatus] = useState('Disconnected');
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const clickedPointsTopicRef = useRef<ROSLIB.Topic | null>(null);
  const dashboardCoordsTopicRef = useRef<ROSLIB.Topic | null>(null);
  
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions(getCanvasDimensions());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Coordinate conversion
  const pixelToMeter = useCallback((px: number, py: number) => ({
    x: ((dimensions.width - px) / dimensions.width) * FIELD_WIDTH,
    y: (py / dimensions.height) * FIELD_HEIGHT
  }), [dimensions]);

  const meterToPixel = useCallback((mx: number, my: number) => ({
    x: dimensions.width - (mx / FIELD_WIDTH) * dimensions.width,
    y: (my / FIELD_HEIGHT) * dimensions.height
  }), [dimensions]);

  // Initialize ROS connection
  useEffect(() => {
    const getRosUrl = () => {
      if (isMobile) {
        return 'ws://192.168.225.136:9090'; // Replace with your computer's LAN IP
      }
      return 'ws://localhost:9090';
    };

    const ros = new ROSLIB.Ros({ url: getRosUrl() });
    rosRef.current = ros;

    ros.on('connection', () => {
      console.log('✅ ROS connected');
      setRosStatus('Connected');
      
      clickedPointsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/clicked_points',
        messageType: 'geometry_msgs/PointStamped'
      });

      dashboardCoordsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/dashboard_coords',
        messageType: 'geometry_msgs/Point'
      });
      dashboardCoordsTopicRef.current.advertise();
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
      if (rosRef.current?.isConnected) {
        if (dashboardCoordsTopicRef.current) {
          dashboardCoordsTopicRef.current.unadvertise();
        }
        rosRef.current.close();
      }
    };
  }, [isMobile]);

  // Publish coordinates
  const publishDashboardCoords = useCallback((x: number, y: number) => {
    if (!dashboardCoordsTopicRef.current) return;

    const point = new ROSLIB.Message({
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      z: 0.0
    });
    
    dashboardCoordsTopicRef.current.publish(point);
  }, []);

  // Handle interactions
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;
    
    if (pixelX < 0 || pixelX > dimensions.width || pixelY < 0 || pixelY > dimensions.height) {
      return;
    }
    
    const {x, y} = pixelToMeter(pixelX, pixelY);
    setCurrentPoint({x, y});
    publishDashboardCoords(x, y);
    
    if (clickedPointsTopicRef.current) {
      const now = new Date();
      const msg = new ROSLIB.Message({
        header: { 
          stamp: {
            secs: Math.floor(now.getTime() / 1000),
            nsecs: (now.getTime() % 1000) * 1000000
          },
          frame_id: 'map' 
        },
        point: { x, y, z: 0 }
      });
      clickedPointsTopicRef.current.publish(msg);
    }
  }, [dimensions, pixelToMeter, publishDashboardCoords]);

  // Clear point
  const clearPoint = useCallback(() => {
    setCurrentPoint(null);
  }, []);

  // Draw field
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
      ctx.lineTo(px, dimensions.height);
      ctx.stroke();
      ctx.fillText(`${x}m`, px + 5, 15);
    }
    
    // Horizontal grid lines
    for (let y = 0; y <= FIELD_HEIGHT; y += GRID_SPACING) {
      const py = meterToPixel(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(dimensions.width, py);
      ctx.stroke();
      ctx.fillText(`${y}m`, dimensions.width - 30, py + 15);
    }

    // Draw field elements
    FIELD_ELEMENTS.forEach(element => {
      const pos = meterToPixel(element.position.x, element.position.y);
      
      if (element.type === 'rectangle') {
        const dims = element.dimensions as {width: number, height: number};
        const width = (dims.width / FIELD_WIDTH) * dimensions.width;
        const height = (dims.height / FIELD_HEIGHT) * dimensions.height;
        
        ctx.fillStyle = element.color;
        ctx.fillRect(pos.x - width/2, pos.y - height/2, width, height);
      }
      else if (element.type === 'line') {
        const dims = element.dimensions as {width: number, height: number};
        const width = (dims.width / FIELD_WIDTH) * dimensions.width;
        const height = (dims.height / FIELD_HEIGHT) * dimensions.height;
        
        ctx.strokeStyle = element.color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x, pos.y + height);
        ctx.stroke();
      }
    });

    // Draw current point
    if (currentPoint) {
      const pos = meterToPixel(currentPoint.x, currentPoint.y);
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(
        `(${currentPoint.x.toFixed(2)}m, ${currentPoint.y.toFixed(2)}m)`,
        pos.x - 50,
        pos.y + 20
      );
    }

    // Draw origin marker
    ctx.fillStyle = 'lime';
    ctx.beginPath();
    ctx.arc(dimensions.width, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('Origin (0,0)', dimensions.width - 80, 15);
  }, [currentPoint, dimensions, meterToPixel]);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Field Coordinates</h2>
      <p style={styles.subtitle}>Top-Right Origin System</p>
      
      <div style={styles.statusBar(rosStatus)}>
        <div style={styles.statusContainer}>
          <span>ROS Status:</span>
          <span style={styles.statusText(rosStatus)}>{rosStatus}</span>
        </div>
        <button 
          onClick={clearPoint}
          style={styles.clearButton}
          aria-label="Clear point"
        >
          Clear
        </button>
      </div>
      
      <div style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onClick={(e) => handleInteraction(e.clientX, e.clientY)}
          onTouchEnd={(e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            handleInteraction(touch.clientX, touch.clientY);
          }}
          style={styles.canvas}
        />
      </div>
      
      <div style={styles.pointInfo}>
        <h3 style={styles.infoTitle}>Current Point</h3>
        {currentPoint ? (
          <p style={styles.coordinates}>
            X: {currentPoint.x.toFixed(2)}m | Y: {currentPoint.y.toFixed(2)}m
          </p>
        ) : (
          <p style={styles.instructions}>
            {isMobile ? 'Tap' : 'Click'} on the field to set a point
          </p>
        )}
      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    padding: '15px',
    fontFamily: 'Arial, sans-serif',
    maxWidth: '100%',
    overflowX: 'hidden' as const,
    backgroundColor: '#f9f9f9',
    minHeight: '100vh'
  },
  title: {
    fontSize: '1.5rem',
    marginBottom: '0.25rem',
    color: '#333',
    fontWeight: 'bold' as const
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#666',
    marginBottom: '1.25rem'
  },
  statusBar: (status: string) => ({
    padding: '12px',
    background: status === 'Connected' ? '#e8f5e9' : '#ffebee',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }),
  statusContainer: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  statusText: (status: string) => ({
    color: status === 'Connected' ? '#2e7d32' : '#c62828',
    fontWeight: 'bold' as const
  }),
  clearButton: {
    padding: '8px 16px',
    background: '#ef5350',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold' as const,
    transition: 'background 0.2s',
    ':hover': {
      background: '#d32f2f'
    }
  },
  canvasContainer: {
    position: 'relative' as const,
    margin: '0 auto 15px',
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    touchAction: 'none' as const
  },
  canvas: {
    border: '2px solid #333',
    background: '#222',
    display: 'block',
    width: '100%',
    height: 'auto',
    '-webkit-tap-highlight-color': 'transparent'
  },
  pointInfo: {
    background: '#ffffff',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  infoTitle: {
    margin: '0 0 8px 0',
    fontSize: '1.1rem',
    color: '#333'
  },
  coordinates: {
    margin: '0',
    fontWeight: 'bold' as const,
    color: '#d32f2f',
    fontSize: '1rem'
  },
  instructions: {
    margin: '0',
    color: '#666',
    fontStyle: 'italic' as const,
    fontSize: '0.95rem'
  }
};

export default GameField;