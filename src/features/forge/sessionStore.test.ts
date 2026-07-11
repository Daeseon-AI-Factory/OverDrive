import { useSessionStore } from './sessionStore';

describe('sessionStore set correction', () => {
  afterEach(() => {
    useSessionStore.setState({
      activeSessionId: null,
      startedAt: null,
      setCount: 0,
      volumeKg: 0,
      cpAtStart: 0,
      ritual: null,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
  });

  it('keeps session mutations single-flight and never underflows', () => {
    useSessionStore.setState({ pendingLogWrites: 0 });
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(true);
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(false);
    expect(useSessionStore.getState().pendingLogWrites).toBe(1);

    useSessionStore.getState().endLogWrite();
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(true);
    useSessionStore.getState().endLogWrite();
    useSessionStore.getState().endLogWrite();
    expect(useSessionStore.getState().pendingLogWrites).toBe(0);
  });

  it('atomically excludes finish and session mutations in both directions', () => {
    useSessionStore.setState({ pendingLogWrites: 0, finishing: false });
    expect(useSessionStore.getState().tryBeginFinish()).toBe(true);
    expect(useSessionStore.getState().tryBeginFinish()).toBe(false);
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(false);

    useSessionStore.getState().cancelFinish();
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(true);
    expect(useSessionStore.getState().tryBeginFinish()).toBe(false);
    useSessionStore.getState().endLogWrite();
    expect(useSessionStore.getState().tryBeginFinish()).toBe(true);
  });

  it('does not erase an existing mutation or finish lease when a session is started or resumed', () => {
    useSessionStore.setState({ pendingLogWrites: 1, finishing: false });
    useSessionStore.getState().start('session-1', 100, true);
    expect(useSessionStore.getState().pendingLogWrites).toBe(1);
    expect(useSessionStore.getState().tryBeginLogWrite()).toBe(false);

    useSessionStore.getState().endLogWrite();
    useSessionStore.setState({ finishing: true });
    useSessionStore.getState().resume('session-2', 100, 2, 900);
    expect(useSessionStore.getState()).toMatchObject({ activeSessionId: 'session-2', finishing: true });
  });

  it('replaces volume without changing the set count or last-set anchor', () => {
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setCount: 1,
      volumeKg: 500,
      lastSetAt: 1234,
    });

    useSessionStore.getState().replaceSetVolume(500, 480);

    expect(useSessionStore.getState()).toMatchObject({
      activeSessionId: 'session-1',
      setCount: 1,
      volumeKg: 480,
      lastSetAt: 1234,
      logRevision: 1,
    });
  });

  it('reconciles counters from the durable active-session summary only', () => {
    useSessionStore.setState({ activeSessionId: 'session-1', setCount: 3, volumeKg: 1500, logRevision: 0 });

    useSessionStore.getState().reconcileActivity('other-session', 0, 0);
    expect(useSessionStore.getState()).toMatchObject({ setCount: 3, volumeKg: 1500, logRevision: 0 });

    useSessionStore.getState().reconcileActivity('session-1', 2, 900);
    expect(useSessionStore.getState()).toMatchObject({ setCount: 2, volumeKg: 900, logRevision: 1 });
  });
});
