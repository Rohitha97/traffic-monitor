import { OperatorConsole } from '@/components/OperatorConsole';

/*
 * The operator's screen — master–detail with a pinned critical band, the
 * layout chosen in Pass A §04 ("A, with one lane borrowed from B").
 *
 * The page stays a server component; the client boundary starts at
 * OperatorConsole, which owns the SSE connection, the shared one-second tick
 * and the event store.
 */
export default function DashboardPage() {
  return <OperatorConsole />;
}
