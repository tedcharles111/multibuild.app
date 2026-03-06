import express from 'express';
import E2BService from '../services/e2bService.js';

const router = express.Router();
const e2bService = new E2BService(process.env.E2B_API_KEY);

router.post('/create', async (req, res) => {
  try {
    const { files, startCommand } = req.body;

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ 
        error: 'Files are required' 
      });
    }

    const result = await e2bService.createPreviewSession(files, startCommand);
    
    res.json({
      success: true,
      sessionId: result.sessionId,
      previewUrl: result.previewUrl,
      message: 'Preview created successfully'
    });

  } catch (error) {
    console.error('Preview creation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create preview'
    });
  }
});

router.post('/stop/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stopped = await e2bService.stopSession(sessionId);
    
    if (stopped) {
      res.json({ 
        success: true, 
        message: 'Preview session stopped' 
      });
    } else {
      res.status(404).json({ 
        error: 'Session not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessions = e2bService.getActiveSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (session) {
    res.json({ 
      success: true, 
      session 
    });
  } else {
    res.status(404).json({ 
      error: 'Session not found or expired' 
    });
  }
});

router.get('/sessions', (req, res) => {
  const sessions = e2bService.getActiveSessions();
  res.json({
    success: true,
    count: sessions.length,
    sessions
  });
});

export default router;
