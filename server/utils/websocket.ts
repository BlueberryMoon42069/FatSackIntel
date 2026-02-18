import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export interface OutageUpdate {
  type: "outage_update";
  outageCount: number;
  providers: string[];
  timestamp: string;
}

export class OutageWebSocketServer {
  private wss: WebSocketServer;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws/outages" });

    this.wss.on("connection", (ws) => {
      // Send an immediate ping so the client knows it connected
      this.send(ws, { type: "outage_update", outageCount: 0, providers: [], timestamp: new Date().toISOString() });

      ws.on("error", (err) => {
        console.error("[ws] Client error:", err.message);
      });
    });

    this.wss.on("error", (err) => {
      console.error("[ws] WebSocket server error:", err.message);
    });

    console.log("[ws] OutageWebSocketServer listening on /ws/outages");
  }

  private send(ws: WebSocket, data: OutageUpdate): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcast(data: OutageUpdate): void {
    this.wss.clients.forEach((ws) => {
      this.send(ws, data);
    });
  }

  broadcastOutageUpdate(outageCount: number, providers: string[]): void {
    this.broadcast({
      type: "outage_update",
      outageCount,
      providers,
      timestamp: new Date().toISOString(),
    });
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }
}

let wsServer: OutageWebSocketServer | null = null;

export function initWebSocket(httpServer: Server): OutageWebSocketServer {
  wsServer = new OutageWebSocketServer(httpServer);
  return wsServer;
}

export function getWebSocketServer(): OutageWebSocketServer | null {
  return wsServer;
}
