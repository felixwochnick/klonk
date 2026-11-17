import { adminMcpServer } from '../mcp/tools'

// MCP-Server der Verwaltung (Streamable HTTP): KI-Assistenten richten Organisation, Konten und Klassen ein
export default defineEventHandler(event => handleMcpRequest(event, adminMcpServer))
