import { create } from 'zustand'
import apiClient from '../api/client'

interface Session {
  id: string
  started_at: string
  ended_at: string | null
  topic_hint: string | null
  checkin_opt_in: boolean
  checkin_completed_at: string | null
  avatar_used: boolean
  checkin_payload?: Record<string, unknown> | null
  meta?: Record<string, unknown> | null
}

interface CreateSessionResponse extends Session {
  previous_session_closed: boolean
}

interface Message {
  id: string
  role: string
  content: string
  created_at: string
  safety_flags?: Record<string, unknown> | null
}

interface ChatState {
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  isLoadingSessions: boolean
  isLoadingMessages: boolean
  saveHistoryEnabled: boolean
  riskDetected: boolean

  loadSessions: () => Promise<void>
  createSession: (topicHint?: string) => Promise<CreateSessionResponse>
  loadSession: (sessionId: string) => Promise<Session>
  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, content: string) => Promise<void>
  endSession: (sessionId: string) => Promise<void>
  loadPreferences: () => Promise<void>
  clearRisk: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  isLoadingSessions: false,
  isLoadingMessages: false,
  saveHistoryEnabled: false,
  riskDetected: false,

  loadSessions: async () => {
    set({ isLoadingSessions: true })
    try {
      const res = await apiClient.get('/sessions')
      set({ sessions: res.data })
    } finally {
      set({ isLoadingSessions: false })
    }
  },

  createSession: async (topicHint?: string) => {
    const body = topicHint ? { topic_hint: topicHint } : {}
    const res = await apiClient.post('/sessions', body)
    const session: CreateSessionResponse = res.data
    set((state) => ({ sessions: [session, ...state.sessions], currentSession: session }))
    return session
  },

  loadSession: async (sessionId: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}`)
    const session: Session = res.data
    set({ currentSession: session })
    return session
  },

  loadMessages: async (sessionId: string) => {
    set({ isLoadingMessages: true })
    try {
      const res = await apiClient.get(`/sessions/${sessionId}/messages`)
      set({ messages: res.data })
    } finally {
      set({ isLoadingMessages: false })
    }
  },

  sendMessage: async (sessionId: string, content: string) => {
    // Optimistically add user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingText: '',
    }))

    try {
      const token = localStorage.getItem('mabel_token')
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
      const response = await fetch(`${baseUrl}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      })

      if (!response.ok || !response.body) {
        throw new Error('Stream failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const data = JSON.parse(jsonStr)
            if (data.risk_detected && !data.done) {
              // Pre-filter risk detected — trigger SOS
              set({ riskDetected: true })
            } else if (data.token) {
              accumulated += data.token
              set({ streamingText: accumulated })
            } else if (data.done) {
              const assistantMsg: Message = {
                id: data.message_id || `done-${Date.now()}`,
                role: 'assistant',
                content: accumulated,
                created_at: new Date().toISOString(),
              }
              const updates: Partial<ChatState> = {
                streamingText: '',
                isStreaming: false,
              }
              // Post-filter risk detected
              if (data.risk_detected) {
                updates.riskDetected = true
              }
              set((state) => ({
                ...state,
                messages: [...state.messages, assistantMsg],
                ...updates,
              }))
            } else if (data.error) {
              set({ streamingText: '', isStreaming: false })
              throw new Error(data.error)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }
    } catch (error) {
      set({ isStreaming: false, streamingText: '' })
      throw error
    }
  },

  endSession: async (sessionId: string) => {
    await apiClient.patch(`/sessions/${sessionId}`, { action: 'end' })
    set((state) => ({
      currentSession: state.currentSession
        ? { ...state.currentSession, ended_at: new Date().toISOString() }
        : null,
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ended_at: new Date().toISOString() } : s
      ),
    }))
  },

  loadPreferences: async () => {
    try {
      const res = await apiClient.get('/preferences/me')
      set({ saveHistoryEnabled: res.data.save_history ?? false })
    } catch {
      set({ saveHistoryEnabled: false })
    }
  },

  clearRisk: () => {
    set({ riskDetected: false })
  },
}))
