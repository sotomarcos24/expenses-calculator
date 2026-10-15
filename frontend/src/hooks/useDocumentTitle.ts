import { useEffect } from 'react'

export const APP_NAME = 'PersonalDolar'

/** Sets `document.title` to `<title> · PersonalDolar` while the calling page is mounted. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
