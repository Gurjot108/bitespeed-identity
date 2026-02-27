// src/index.ts
import express from 'express';
import identifyRouter from './routes/identify';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json()); 

// Mount the identify route
app.use('/identify', identifyRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running beautifully on port ${PORT}`);
});