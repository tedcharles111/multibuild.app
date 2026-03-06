import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 E2B Preview Engine running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Preview endpoint: http://localhost:${PORT}/api/preview/create`);
});
