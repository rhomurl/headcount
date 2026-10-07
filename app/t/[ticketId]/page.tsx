import Ticket from '@/components/ticket';
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) { const { ticketId } = await params; return <Ticket key={ticketId} ticketId={ticketId} />; }
