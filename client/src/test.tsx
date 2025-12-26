import React from 'react';
import ReactDOM from 'react-dom/client';

function TestApp() {
  return (
    <div>
      <h1>Hello, this is a test app to check if React is working!</h1>
      <p>If you can see this, React is set up correctly.</p>
    </div>
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container!);
root.render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>
);