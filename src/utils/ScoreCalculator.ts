import { Round } from '../types/game';

export const createId = (): string => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const roundToTwo = (num: number): number => Math.round(num * 100) / 100;

export const calculateCumulativeScore = (
    rounds: Round[],
    playerIndex: number,
    upToRoundIndex: number,
): number => {
    let total = 0;
    for (let i = 0; i <= upToRoundIndex; i++) {
        const score = rounds[i].scores[playerIndex]?.score;
        if (score !== null) total += score;
    }
    return total;
};

export const canAutoComplete = (round: Round, playerCount: number): boolean =>
    playerCount > 1 && round.scores.filter((s) => s.score === null).length === 1;

export const findMissingPlayer = (round: Round): number =>
    round.scores.findIndex((s) => s.score === null);

export const calculateMissingScore = (round: Round, targetTotal: number): number => {
    const currentSum = round.scores.reduce((sum, s) => sum + (s.score ?? 0), 0);
    return targetTotal - currentSum;
};
