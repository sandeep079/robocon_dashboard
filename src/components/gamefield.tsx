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
const ROBOT_RADIUS = 0.3; // meters in real world
const ROBOT_ARROW_LENGTH = 0.5; // meters in real world

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

interface Point {
  x: number;
  y: number;
}

interface RobotPosition extends Point {
  angle: number; // radians
  linearVelocity?: number;
  angularVelocity?: number;
}

const GameField = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState(getCanvasDimensions());
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [rosStatus, setRosStatus] = useState('Disconnected');
  const [robotPosition, setRobotPosition] = useState<RobotPosition | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const clickedPointsTopicRef = useRef<ROSLIB.Topic | null>(null);
  const dashboardCoordsTopicRef = useRef<ROSLIB.Topic | null>(null);
  const odomTopicRef = useRef<ROSLIB.Topic | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Handle window resize with debounce
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setDimensions(getCanvasDimensions());
      }, 200);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Coordinate conversion with boundary checks
  const pixelToMeter = useCallback((px: number, py: number): Point => ({
    x: Math.min(FIELD_WIDTH, Math.max(0, 
      ((dimensions.width - px) / dimensions.width) * FIELD_WIDTH)),
    y: Math.min(FIELD_HEIGHT, Math.max(0, 
      (py / dimensions.height) * FIELD_HEIGHT))
  }), [dimensions]);

  const meterToPixel = useCallback((mx: number, my: number): Point => ({
x: dimensions.width - (Math.min(FIELD_WIDTH, Math.max(0, mx)) / FIELD_WIDTH) * dimensions.width,
// Properly balanced parentheses now
y: (Math.min(FIELD_HEIGHT, Math.max(0, my)) / FIELD_HEIGHT) * dimensions.height
// Single balanced set of parentheses
  }), [dimensions]);

  // Quaternion to Euler angle conversion
  const quaternionToEuler = (q: {x: number, y: number, z: number, w: number}) => {
    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
    const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (q.w * q.y - q.z * q.x);
    const pitch = Math.abs(sinp) >= 1 ? 
      Math.sign(sinp) * Math.PI / 2 : 
      Math.asin(sinp);

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { roll, pitch, yaw };
  };

  // Initialize ROS connection with reconnection logic
  useEffect(() => {
    if (connectionAttempts > 3) return;

    const getRosUrl = () => {
      if (isMobile) {
        return 'ws://192.168.225.136:9090'; // Replace with your computer's LAN IP
      }
      return 'ws://localhost:9090';
    };

    const ros = new ROSLIB.Ros({ 
      url: getRosUrl(),
      transportLibrary: 'websocket'
    });
    rosRef.current = ros;

    const handleConnection = () => {
      console.log('✅ ROS connected');
      setRosStatus('Connected');
      
      // Setup clicked points topic
      clickedPointsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/clicked_points',
        messageType: 'geometry_msgs/PointStamped'
      });

      // Setup dashboard coordinates publisher
      dashboardCoordsTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/dashboard_coords',
        messageType: 'geometry_msgs/Point'
      });
      dashboardCoordsTopicRef.current.advertise();

      // Subscribe to odometry topic
      odomTopicRef.current = new ROSLIB.Topic({
        ros,
        name: '/odom',
        messageType: 'nav_msgs/Odometry'
      });

      odomTopicRef.current.subscribe((message: any) => {
        try {
          const pose = message.pose.pose;
          const twist = message.twist.twist;
          
          const { yaw } = quaternionToEuler(pose.orientation);
          
          setRobotPosition({
            x: pose.position.x,
            y: pose.position.y,
            angle: yaw,
            linearVelocity: twist.linear.x,
            angularVelocity: twist.angular.z
          });
        } catch (error) {
          console.error('Error processing odometry message:', error);
        }
      });
    };

    const handleError = (error: any) => {
      console.error('❌ ROS connection error:', error);
      setRosStatus(`Error: ${error.message || 'Unknown error'}`);
      attemptReconnect();
    };

    const handleClose = () => {
      console.log('⚠️ ROS connection closed');
      setRosStatus('Disconnected');
      setRobotPosition(null);
      attemptReconnect();
    };

    const attemptReconnect = () => {
      if (connectionAttempts <= 3) {
        const delay = Math.min(3000, 1000 * Math.pow(2, connectionAttempts));
        console.log(`Reconnecting in ${delay/1000} seconds...`);
        
        setTimeout(() => {
          setConnectionAttempts(prev => prev + 1);
          ros.connect(getRosUrl());
        }, delay);
      }
    };

    ros.on('connection', handleConnection);
    ros.on('error', handleError);
    ros.on('close', handleClose);

    // Initial connection
    ros.connect(getRosUrl());

    return () => {
      ros.removeListener('connection', handleConnection);
      ros.removeListener('error', handleError);
      ros.removeListener('close', handleClose);
      
      if (rosRef.current?.isConnected) {
        if (dashboardCoordsTopicRef.current) {
          dashboardCoordsTopicRef.current.unadvertise();
        }
        if (odomTopicRef.current) {
          odomTopicRef.current.unsubscribe();
        }
        rosRef.current.close();
      }
    };
  }, [isMobile, connectionAttempts]);

  // Publish coordinates with validation
  const publishDashboardCoords = useCallback((x: number, y: number) => {
    if (!dashboardCoordsTopicRef.current) return;

    // Validate coordinates are within field bounds
    const validX = Math.min(FIELD_WIDTH, Math.max(0, x));
    const validY = Math.min(FIELD_HEIGHT, Math.max(0, y));

    const point = new ROSLIB.Message({
      x: parseFloat(validX.toFixed(2)),
      y: parseFloat(validY.toFixed(2)),
      z: 0.0
    });
    
    dashboardCoordsTopicRef.current.publish(point);
  }, []);

  // Handle canvas interactions
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current || rosStatus !== 'Connected') return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;
    
    // Check if click is within canvas bounds
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
        point: { 
          x: parseFloat(x.toFixed(3)),
          y: parseFloat(y.toFixed(3)),
          z: 0 
        }
      });
      clickedPointsTopicRef.current.publish(msg);
    }
  }, [dimensions, pixelToMeter, publishDashboardCoords, rosStatus]);

  // Clear current point
  const clearPoint = useCallback(() => {
    setCurrentPoint(null);
    publishDashboardCoords(0, 0);
  }, [publishDashboardCoords]);

  // Animation loop for smoother rendering
  const drawField = useCallback(() => {
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

    // Draw robot position
    if (robotPosition) {
      const pos = meterToPixel(robotPosition.x, robotPosition.y);
      const robotRadiusPx = (ROBOT_RADIUS / FIELD_WIDTH) * dimensions.width;
      const arrowLengthPx = (ROBOT_ARROW_LENGTH / FIELD_WIDTH) * dimensions.width;
      
      // Draw robot body (circle)
      ctx.fillStyle = 'rgba(0, 150, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, robotRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 100, 200, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw robot orientation (arrow)
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(
        pos.x + Math.cos(robotPosition.angle) * arrowLengthPx,
        pos.y + Math.sin(robotPosition.angle) * arrowLengthPx
      );
      ctx.stroke();
      
      // Draw position text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        `🤖 (${robotPosition.x.toFixed(2)}, ${robotPosition.y.toFixed(2)})`,
        pos.x,
        pos.y - robotRadiusPx - 5
      );
      
      // Draw velocity info if available
      if (robotPosition.linearVelocity !== undefined || 
          robotPosition.angularVelocity !== undefined) {
        ctx.font = '10px Arial';
        ctx.fillText(
          `v: ${robotPosition.linearVelocity?.toFixed(2) ?? '?'} m/s | ω: ${(robotPosition.angularVelocity ?? 0).toFixed(2)} rad/s`,
          pos.x,
          pos.y + robotRadiusPx + 15
        );
      }
    }

    // Draw current point
    if (currentPoint) {
      const pos = meterToPixel(currentPoint.x, currentPoint.y);
      
      // Draw crosshair
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x - 10, pos.y);
      ctx.lineTo(pos.x + 10, pos.y);
      ctx.moveTo(pos.x, pos.y - 10);
      ctx.lineTo(pos.x, pos.y + 10);
      ctx.stroke();
      
      // Draw point circle
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw coordinates text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(
        `📍 (${currentPoint.x.toFixed(2)}, ${currentPoint.y.toFixed(2)})`,
        pos.x + 15,
        pos.y - 5
      );
    }

    // Draw origin marker
    ctx.fillStyle = 'lime';
    ctx.beginPath();
    ctx.arc(dimensions.width, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Origin (0,0)', dimensions.width - 5, 15);

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(drawField);
  }, [currentPoint, dimensions, meterToPixel, robotPosition]);

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(drawField);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawField]);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Field Coordinates Dashboard</h2>
      <p style={styles.subtitle}>Top-Right Origin System | Field: {FIELD_WIDTH}m × {FIELD_HEIGHT}m</p>
      
      <div style={styles.statusBar(rosStatus)}>
        <div style={styles.statusContainer}>
          <span>ROS Status:</span>
          <span style={styles.statusText(rosStatus)}>
            {rosStatus} {connectionAttempts > 0 && `(Attempt ${connectionAttempts})`}
          </span>
        </div>
        <div style={styles.buttonGroup}>
          <button 
            onClick={() => rosRef.current?.connect(rosRef.current?.url!)}
            style={styles.reconnectButton}
            disabled={rosStatus === 'Connected'}
          >
            Reconnect
          </button>
          <button 
            onClick={clearPoint}
            style={styles.clearButton}
            disabled={!currentPoint}
            aria-label="Clear point"
          >
            Clear Point
          </button>
        </div>
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
          aria-label="Field coordinate system"
        />
      </div>
      
      <div style={styles.infoPanel}>
        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>Robot Status</h3>
          {robotPosition ? (
            <>
              <div style={styles.infoRow}>
                <span>Position:</span>
                <span style={styles.infoValue}>
                  X: {robotPosition.x.toFixed(3)}m | Y: {robotPosition.y.toFixed(3)}m
                </span>
              </div>
              <div style={styles.infoRow}>
                <span>Orientation:</span>
                <span style={styles.infoValue}>
                  {(robotPosition.angle * 180/Math.PI).toFixed(1)}°
                </span>
              </div>
              <div style={styles.infoRow}>
                <span>Linear Velocity:</span>
                <span style={styles.infoValue}>
                  {robotPosition.linearVelocity?.toFixed(3) ?? 'N/A'} m/s
                </span>
              </div>
              <div style={styles.infoRow}>
                <span>Angular Velocity:</span>
                <span style={styles.infoValue}>
                  {robotPosition.angularVelocity?.toFixed(3) ?? 'N/A'} rad/s
                </span>
              </div>
            </>
          ) : (
            <p style={styles.noData}>No robot data available</p>
          )}
        </div>
        
        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>Selected Point</h3>
          {currentPoint ? (
            <>
              <div style={styles.infoRow}>
                <span>Coordinates:</span>
                <span style={styles.infoValue}>
                  X: {currentPoint.x.toFixed(3)}m | Y: {currentPoint.y.toFixed(3)}m
                </span>
              </div>
              {robotPosition && (
                <div style={styles.infoRow}>
                  <span>Distance to Robot:</span>
                  <span style={styles.infoValue}>
                    {Math.sqrt(
                      Math.pow(currentPoint.x - robotPosition.x, 2) + 
                      Math.pow(currentPoint.y - robotPosition.y, 2)
                    ).toFixed(3)}m
                  </span>
                </div>
              )}
            </>
          ) : (
            <p style={styles.instructions}>
              {isMobile ? 'Tap' : 'Click'} on the field to set a point
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Enhanced styles with better organization
const styles = {
  container: {
    padding: '20px',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    maxWidth: '100%',
    overflowX: 'hidden' as const,
    backgroundColor: '#f5f7fa',
    minHeight: '100vh',
    color: '#333'
  },
  title: {
    fontSize: '1.8rem',
    marginBottom: '0.25rem',
    color: '#2c3e50',
    fontWeight: '600' as const,
    textAlign: 'center' as const
  },
  subtitle: {
    fontSize: '1rem',
    color: '#7f8c8d',
    marginBottom: '1.5rem',
    textAlign: 'center' as const
  },
  statusBar: (status: string) => ({
    padding: '12px 20px',
    background: status === 'Connected' ? '#e8f5e9' : 
               status.startsWith('Error') ? '#ffebee' : '#fff3e0',
    borderRadius: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    flexWrap: 'wrap' as const,
    gap: '10px'
  }),
  statusContainer: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    fontSize: '1rem'
  },
  statusText: (status: string) => ({
    color: status === 'Connected' ? '#2e7d32' : 
          status.startsWith('Error') ? '#c62828' : '#e65100',
    fontWeight: '600' as const,
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255,255,255,0.7)'
  }),
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const
  },
  reconnectButton: {
    padding: '8px 16px',
    background: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500' as const,
    transition: 'all 0.2s',
    ':hover': {
      background: '#1565c0'
    },
    ':disabled': {
      background: '#b0bec5',
      cursor: 'not-allowed'
    }
  },
  clearButton: {
    padding: '8px 16px',
    background: '#ef5350',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500' as const,
    transition: 'all 0.2s',
    ':hover': {
      background: '#d32f2f'
    },
    ':disabled': {
      background: '#ef9a9a',
      cursor: 'not-allowed'
    }
  },
  canvasContainer: {
    position: 'relative' as const,
    margin: '0 auto 20px',
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    touchAction: 'none' as const,
    border: '2px solid #333'
  },
  canvas: {
    background: '#222',
    display: 'block',
    width: '100%',
    height: 'auto',
    '-webkit-tap-highlight-color': 'transparent'
  },
  infoPanel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '20px'
  },
  infoSection: {
    background: '#ffffff',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  infoTitle: {
    margin: '0 0 15px 0',
    fontSize: '1.2rem',
    color: '#2c3e50',
    borderBottom: '1px solid #eee',
    paddingBottom: '8px'
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    fontSize: '0.95rem'
  },
  infoValue: {
    fontWeight: '500' as const,
    color: '#1976d2'
  },
  noData: {
    margin: '0',
    color: '#95a5a6',
    fontStyle: 'italic' as const
  },
  instructions: {
    margin: '0',
    color: '#7f8c8d',
    fontStyle: 'italic' as const
  }
};

export default GameField;