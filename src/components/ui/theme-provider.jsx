import React, { createContext, useEffect, useState, useMemo, useCallback } from "react"
import PropTypes from "prop-types"

const ThemeProviderContext = createContext({
  theme: "system",
  setTheme: () => null,
})

// OPTIMIZED PATTERN: Memoized ThemeProvider component
export const ThemeProvider = React.memo(function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(storageKey) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  // Memoized theme setter to prevent recreation
  const handleSetTheme = useCallback((newTheme) => {
    localStorage.setItem(storageKey, newTheme)
    setTheme(newTheme)
  }, [storageKey])

  // Memoized context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    theme,
    setTheme: handleSetTheme,
  }), [theme, handleSetTheme])

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
})

ThemeProvider.propTypes = {
  children: PropTypes.node,
  defaultTheme: PropTypes.string,
  storageKey: PropTypes.string,
}

