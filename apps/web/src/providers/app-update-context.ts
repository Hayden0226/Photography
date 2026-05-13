import { createContext, use } from 'react'

interface AppUpdateContextValue {
  needRefresh: boolean
  updateApp: () => void
}

export const AppUpdateContext = createContext<AppUpdateContextValue>({
  needRefresh: false,
  updateApp: () => {},
})

export const useAppUpdate = () => use(AppUpdateContext)
