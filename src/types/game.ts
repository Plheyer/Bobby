export interface ScoreEntry {
    playerName: string;
    score: number | null;
}

export interface Round {
    scores: ScoreEntry[];
}

export interface Game {
    id: string;
    createdAt: string;
    players: Set<string>;
    rounds: Round[];
}

export interface Settings {
    autoCompleteMode: 'fixed' | 'prompt';
    fixedTotal: number;
    scoreOrder: 'highest-wins' | 'lowest-wins';
    nullosLabel: string;
    kingLabel: string;
}
