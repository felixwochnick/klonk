import { appMcpServer } from '../mcp/tools'

// MCP-Server der Lern-App (Streamable HTTP): KI-Assistenten richten Unterricht ein – Anmeldung per OAuth oder persönlichem Token
export default defineEventHandler(event => handleMcpRequest(event, appMcpServer))
