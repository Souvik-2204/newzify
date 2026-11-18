// Vercel's Express builder detects this module and serves public/ from its CDN.
import express from 'express';
import { createApp } from './server/app.mjs';
import web from './server/generated-web.mjs';

export default createApp({ app: express(), web });
