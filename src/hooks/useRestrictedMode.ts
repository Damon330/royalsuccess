import { useContext } from 'react'
import { RestrictedModeContext } from '../context/RestrictedModeContext'

export function useRestrictedMode() {
  return useContext(RestrictedModeContext)
}
