import { redirect } from "next/navigation";

/**
 * The address the owner asked for, pointing at where the portal actually lives.
 *
 * Every staff screen sits under /app — that is where the shell, the session and
 * the route guards are. Building a second tree at /manager would have meant a
 * second copy of all three, which is exactly the "separate application" the
 * brief ruled out. So the short address works, and lands on the real page.
 */
export default function ManagerEntry() {
  redirect("/app/manager");
}
