import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error, info) {
    console.error('React error:', error, info);
    this.setState({ error, info });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { error, info } = this.state;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>Something went wrong</h2>
        <pre style={{ whiteSpace:'pre-wrap', background:'#fff', padding:12, borderRadius:8, border:'1px solid #eee', maxHeight:360, overflow:'auto' }}>
          {String(error && error.message)}{"\n\n"}
          {info?.componentStack}
        </pre>
        <div style={{ marginTop:12, display:'flex', gap:8 }}>
          <button onClick={() => window.location.reload()}>Reload</button>
          <button onClick={() => { this.setState({ error: null, info: null }); }}>Dismiss</button>
        </div>
      </div>
    );
  }
}