export interface GitFileStatus {
  path: string
  /** "M" | "A" | "D" | "R" | "U" (untracked) */
  status: string
  staged: boolean
}

export interface DiffLine {
  lineNumber: number
  /** "added" | "modified" */
  kind: string
}
