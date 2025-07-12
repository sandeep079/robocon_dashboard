//import { useEffect, useState } from 'react';
//import ROSLIB from 'roslib';
//
//const RosSubscriberTest = () => {
//  const [messages, setMessages] = useState<any[]>([]);
//  const [status, setStatus] = useState('Disconnected');
//
//  useEffect(() => {
//    const ros = new ROSLIB.Ros({
//      url: 'ws://localhost:9090' // Match your rosbridge URL
//    });
//
//    ros.on('connection', () => {
//      setStatus('Connected');
//      console.log('✅ ROS connected');
//    });
//
//    ros.on('error', (error) => {
//      setStatus(`Error: ${error.message}`);
//      console.error('❌ ROS connection error:', error);
//    });
//
//    ros.on('close', () => {
//      setStatus('Disconnected');
//      console.log('⚠️ ROS connection closed');
//    });
//
//    const odomTopic = new ROSLIB.Topic({
//      ros,
//      name: '/odom',
//      messageType: 'nav_msgs/Odometry'
//    });
//
//    odomTopic.subscribe((message) => {
//      console.log('Received message:', message);
//      setMessages(prev => [...prev.slice(-9), message]); // Keep last 10 messages
//    });
//
//    return () => {
//      odomTopic.unsubscribe();
//      ros.close();
//    };
//  }, []);
//
//  return (
//    <div style={{
//      padding: '20px',
//      fontFamily: 'monospace',
//      backgroundColor: '#f0f0f0',
//      borderRadius: '8px'
//    }}>
//      <h2>ROS Subscriber Test</h2>
//      <p>Status: <strong>{status}</strong></p>
//      
//      <div style={{
//        marginTop: '20px',
//        maxHeight: '300px',
//        overflowY: 'auto',
//        backgroundColor: 'white',
//        padding: '10px',
//        borderRadius: '4px'
//      }}>
//        <h3>Last 10 Messages:</h3>
//        {messages.length === 0 ? (
//          <p>No messages received yet...</p>
//        ) : (
//          messages.map((msg, i) => (
//            <div key={i} style={{ 
//              marginBottom: '10px',
//              padding: '10px',
//              borderBottom: '1px solid #eee'
//            }}>
//              <pre>{JSON.stringify({
//                position: msg.pose.pose.position,
//                orientation: msg.pose.pose.orientation,
//                linear_vel: msg.twist.twist.linear,
//                angular_vel: msg.twist.twist.angular
//              }, null, 2)}</pre>
//            </div>
//          ))
//        )}
//      </div>
//    </div>
//  );
//};
//
//export default RosSubscriberTest;