import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "3rem 1rem" }}>
      <Suspense fallback={<p>Loading sign up…</p>}>
        <SignUp />
      </Suspense>
    </main>
  );
}
