import Rsvp from '@/components/rsvp';
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Rsvp key={id} id={id} />; }
