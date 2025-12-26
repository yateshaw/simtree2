/**
 * Minimal Server Startup Configuration
 * Designed to bind to port 5000 within 20 seconds by deferring all heavy operations
 */

import express from "express";
import http from "http";
import path from "path";
import { setupVite } from "./vite";

const log = (message: string) => {
  console.log(`[MinimalServer] ${message}`);
};

export async function startMinimalServer() {
  log("Starting minimal server for fast port binding...");

  const app = express();
  const httpServer = http.createServer(app);

  // Basic middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check endpoint - must be available immediately
  app.get("/", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      mode: "minimal-startup"
    });
  });

  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      mode: "minimal-startup"
    });
  });

  // Quick port binding
  const PORT = process.env.PORT || 5000;
  const HOST = '0.0.0.0';

  return new Promise((resolve, reject) => {
    httpServer.once("error", (error: any) => {
      console.error("Minimal server error:", error);
      reject(error);
    });

    httpServer.listen(Number(PORT), HOST, () => {
      log(`Minimal server running on ${HOST}:${PORT}`);
      
      // Set up Vite in development mode
      if (process.env.NODE_ENV !== "production") {
        setupVite(app, httpServer).then(() => {
          log("Vite development server ready");
        }).catch((error) => {
          console.error("Vite setup error:", error);
        });
      } else {
        // Production static files
        const clientPath = path.join(__dirname, "../client/dist");
        app.use(express.static(clientPath));
        
        app.get("*", (req, res) => {
          res.sendFile(path.join(__dirname, "../client/dist/index.html"));
        });
      }

      // Now start full initialization after server is bound
      setTimeout(() => {
        log("Starting full application initialization...");
        import("./index").then((module) => {
          // Initialize the full server but don't bind to port again
          module.initializeFullServer?.(app, httpServer).catch((error: any) => {
            console.error("Full server initialization error:", error);
          });
        });
      }, 1000);

      resolve(httpServer);
    });
  });
}

// Start the minimal server if this file is run directly
if (require.main === module) {
  startMinimalServer().catch((error) => {
    console.error("Failed to start minimal server:", error);
    process.exit(1);
  });
}