'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Flag, Plus, Users } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input, Spinner, Textarea } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui';

interface ChallengeCreator {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
  maxMembers: number | null;
  rules: string | null;
  rewards: string | null;
  creator: ChallengeCreator | null;
  memberCount: number;
  isJoined: boolean;
}

/**
 * Challenges Page
 * Browse community challenges, join or leave them, and create new ones.
 */
export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<Challenge[]>('/api/challenges');
      setChallenges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenges');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const toggleMembership = async (challenge: Challenge) => {
    setBusyId(challenge.id);
    setError(null);
    try {
      await apiRequest(
        `/api/challenges/${challenge.id}/${challenge.isJoined ? 'leave' : 'join'}`,
        { method: 'POST' },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update membership');
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (title.trim().length === 0 || creating) return;
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await apiRequest('/api/challenges', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim(),
          startDate: new Date(`${startDate}T00:00:00`).toISOString(),
          endDate: new Date(`${endDate}T00:00:00`).toISOString(),
          isPublic,
        },
      });
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setIsPublic(true);
      setDialogOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Flag className="h-7 w-7 text-primary" />
            Challenges
          </h1>
          <p className="mt-2 text-muted-foreground">
            Join a challenge to hold yourself accountable alongside the community.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New challenge
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!challenges ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-10 w-10 text-muted-foreground/60" />}
          title="No challenges yet"
          description="Be the first to start a community challenge."
          action={{ label: 'New challenge', onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {challenges.map((challenge) => (
            <Card key={challenge.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{challenge.title}</h2>
                <Badge variant={challenge.isPublic ? 'primary' : 'default'}>
                  {challenge.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{challenge.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="h-3.5 w-3.5" />
                  {formatDate(new Date(challenge.startDate))} –{' '}
                  {formatDate(new Date(challenge.endDate))}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {challenge.memberCount}
                  {challenge.maxMembers ? ` / ${challenge.maxMembers}` : ''}
                </span>
                {challenge.creator && (
                  <span>
                    by {challenge.creator.displayName ?? challenge.creator.name ?? 'Anonymous'}
                  </span>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant={challenge.isJoined ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => void toggleMembership(challenge)}
                  isLoading={busyId === challenge.id}
                >
                  {challenge.isJoined ? 'Leave' : 'Join'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New challenge"
        description="Create a challenge for yourself and the community."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} isLoading={creating}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="30-day meditation streak"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Start date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Input
              label="End date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <Switch label="Public challenge" checked={isPublic} onChange={setIsPublic} />
        </div>
      </Dialog>
    </div>
  );
}
