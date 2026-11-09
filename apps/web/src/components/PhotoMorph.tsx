import { ViewTransition, type ReactNode } from "react";

type Props = { event: string; photoId: string; children: ReactNode };

// default="none" keeps navigation between different photos instant. Only the
// same photo on both pages animates.
export function PhotoMorph({ event, photoId, children }: Props) {
  return (
    <ViewTransition name={`photo-${event}-${photoId}`} default="none" share="photo-morph">
      {children}
    </ViewTransition>
  );
}
