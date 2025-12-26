import axios from "axios";
import { storage } from "../storage";
import type {
  ServerConnection,
  ConnectionLog,
  InsertServerConnection,
  InsertConnectionLog,
} from "@shared/schema";

export type ServerStatus =
  | "online"
  | "offline"
  | "degraded"
  | "warning"
  | "unknown";

interface ServiceCheckConfig {
  name: string;
  url?: string;
  checkFunction?: () => Promise<boolean>;
  interval: number; // milliseconds
}

/**
 * Service for monitoring API and server connections
 */
export class MonitoringService {
  private services: Map<string, ServiceCheckConfig> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor() {
    console.log("Initializing monitoring service...");
  }

  registerService(config: ServiceCheckConfig): void {
    if (!config.url && !config.checkFunction) {
      throw new Error(
        `Service ${config.name} must provide either a URL or a check function`,
      );
    }
    this.services.set(config.name, config);
    console.log(`Registered service for monitoring: ${config.name}`);
  }

  unregisterService(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
    this.services.delete(name);
    console.log(`Unregistered service from monitoring: ${name}`);
  }

  startMonitoring(): void {
    if (this.isRunning) {
      console.log("Monitoring service is already running");
      return;
    }
    Array.from(this.services.entries()).forEach(([name, config]) => {
      this.startServiceCheck(name, config);
    });
    this.isRunning = true;
    console.log("Started monitoring services");
  }

  stopMonitoring(): void {
    Array.from(this.intervals.values()).forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
    this.isRunning = false;
    console.log("Stopped monitoring services");
  }

  private startServiceCheck(name: string, config: ServiceCheckConfig): void {
    console.log(
      `Starting service check for ${name} at interval ${config.interval}ms`,
    );

    this.checkService(name).catch((error) => {
      console.error(`Error checking service ${name}:`, error);
    });

    const interval = setInterval(async () => {
      try {
        const success = await this.checkService(name);
        const status: ServerStatus = success ? "online" : "offline";
        console.log(`Service ${name} check result: ${status}`);
      } catch (error) {
        console.error(`Error in periodic check for service ${name}:`, error);
      }
    }, config.interval);

    this.intervals.set(name, interval);
  }

  async checkService(name: string): Promise<boolean> {
    console.log(`Performing check for service: ${name}`);

    const config = this.services.get(name);
    if (!config) {
      console.error(`Service ${name} not found in monitoring registry`);
      throw new Error(`Service ${name} not registered`);
    }

    try {
      let success = false;
      let response = null;
      let status: ServerStatus = "unknown";
      let responseTime: number | null = null;
      let message: string | null = null;

      const startTime = Date.now();

      if (config.url) {
        try {
          response = await axios.get(config.url, { timeout: 10000 });
          responseTime = Date.now() - startTime;
          if (response.status >= 200 && response.status < 300) {
            status =
              responseTime < 500
                ? "online"
                : responseTime < 2000
                  ? "warning"
                  : "degraded";
            message =
              status !== "online" ? `Slow response: ${responseTime}ms` : null;
            success = true;
          } else if (response.status >= 300 && response.status < 400) {
            status = "warning";
            message = `Redirect response: ${response.status}`;
            success = true;
          } else if (response.status >= 400 && response.status < 500) {
            status = "degraded";
            message = `Client error: ${response.status}`;
            success = false;
          } else {
            status = "offline";
            message = `Server error: ${response.status}`;
            success = false;
          }
        } catch (httpError: any) {
          status = "offline";
          message = httpError.message || "Connection failed";
          success = false;
        }
      } else if (config.checkFunction) {
        try {
          success = await config.checkFunction();
          responseTime = Date.now() - startTime;
          if (success) {
            status =
              responseTime < 500
                ? "online"
                : responseTime < 2000
                  ? "warning"
                  : "degraded";
            message =
              status !== "online" ? `Slow service: ${responseTime}ms` : null;
          } else {
            status = "offline";
            message = "Service check failed";
          }
        } catch (fnError: any) {
          status = "offline";
          message = fnError.message || "Service check failed with error";
          success = false;
        }
      }

      const timestamp = new Date();
      const existing = await storage.getServerConnectionByName(name);
      if (existing) {
        await storage.updateServerConnection(existing.id, {
          status,
          responseTime,
          message,
          metadata: null,
          lastChecked: timestamp,
        });
      } else {
        await storage.createServerConnection({
          serviceName: name,
          status,
          responseTime,
          message,
          metadata: null,
        });
      }

      await this.logConnectionStatusChange(
        name,
        status,
        timestamp,
        responseTime,
        message,
      );
      return success;
    } catch (error: any) {
      console.error(`Service check failed for ${name}:`, error);
      const timestamp = new Date();
      const message = error?.message || "Unknown error during connection check";
      const existing = await storage.getServerConnectionByName(name);
      if (existing) {
        await storage.updateServerConnection(existing.id, {
          status: "offline",
          responseTime: null,
          message,
          metadata: null,
          lastChecked: timestamp,
        });
      } else {
        await storage.createServerConnection({
          serviceName: name,
          status: "offline",
          responseTime: null,
          message,
          metadata: null,
        });
      }

      await this.logConnectionStatusChange(
        name,
        "offline",
        timestamp,
        null,
        message,
        error,
      );
      return false;
    }
  }

  async getServiceStatuses(): Promise<
    Record<
      string,
      {
        status: ServerStatus;
        lastChecked: Date;
        responseTime?: number;
        message?: string | null;
      }
    >
  > {
    const statuses: Record<
      string,
      {
        status: ServerStatus;
        lastChecked: Date;
        responseTime?: number;
        message?: string | null;
      }
    > = {};
    const connections = await storage.getServerConnections();
    for (const connection of connections) {
      statuses[connection.serviceName] = {
        status: connection.status as ServerStatus,
        lastChecked: connection.lastChecked,
        responseTime: connection.responseTime
          ? Number(connection.responseTime)
          : undefined,
        message: connection.message,
      };
    }
    return statuses;
  }

  private async logConnectionStatusChange(
    serviceName: string,
    newStatus: ServerStatus,
    timestamp: Date,
    responseTime: number | null,
    message?: string | null,
    error?: any,
  ): Promise<void> {
    try {
      const connection = await storage.getServerConnectionByName(serviceName);
      let finalMessage: string | null = null;
      if (message) {
        finalMessage = message;
      } else if (error) {
        finalMessage =
          typeof error === "string"
            ? error
            : error.message || JSON.stringify(error);
      }
      if (
        !connection ||
        connection.status !== newStatus ||
        error ||
        finalMessage
      ) {
        await storage.logConnectionStatus({
          serviceName,
          status: newStatus,
          responseTime,
          message: finalMessage,
          metadata: null,
        });
        console.log(
          `Logged ${serviceName} status change to ${newStatus}${finalMessage ? `: ${finalMessage}` : ""}`,
        );
      }
    } catch (logError) {
      console.error(
        `Failed to log connection status change for ${serviceName}:`,
        logError,
      );
    }
  }
}

export const monitoringService = new MonitoringService();
