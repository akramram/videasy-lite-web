/** Search box states exposed to the UI. */
export type SearchStatus = "idle" | "loading" | "success" | "error" | "empty";

export interface IdleState {
  readonly kind: "idle";
}
export interface LoadingState {
  readonly kind: "loading";
}
export interface SuccessState {
  readonly kind: "success";
  readonly results: readonly import("@/lib/cinemeta").Meta[];
}
export interface ErrorState {
  readonly kind: "error";
  readonly message: string;
}
export interface EmptyState {
  readonly kind: "empty";
}
export type SearchState =
  | IdleState
  | LoadingState
  | SuccessState
  | ErrorState
  | EmptyState;
