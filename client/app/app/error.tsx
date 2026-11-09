"use client";
/* A screen inside the app failed to render (M10). Same voice as every error in Corral: what failed, that
   nothing was lost, the retry, and the technical detail last, in mono. */
import { useEffect } from "react";
import { Button } from "@/components/app/primitives";
import { ErrorState } from "@/components/app/States";
import { Icon } from "@/components/app/icons";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="c-app c-apperr">
      <ErrorState title="Couldn’t open this part of Corral" detail={error.digest ? `Reference ${error.digest}` : undefined}
        actions={<><Button variant="primary" onClick={() => retry()}><Icon name="refresh" />Try again</Button><a className="c-btn c-btn--quiet" href="/app">Go to the Unibox</a></>}>
        Nothing you saved is lost. Sequences keep sending and replies keep arriving; this is only this screen failing to load.
      </ErrorState>
    </div>
  );
}
