"use client";

import { createContext, useContext } from "react";

/** What the shell knows that a page inside it may want: today, how many unread. */
export const ShellContext = createContext<{ unread: number }>({ unread: 0 });
export const useShell = () => useContext(ShellContext);
