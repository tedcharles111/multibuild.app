import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import previewRoutes from './routes/preview.js';

dotenv.config();

const app = express();

const corsOptions = {
  origin: ['http://localhost:3000', 'https://themultiverse.build'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'E2B Preview Engine',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/preview', previewRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

export default app;
