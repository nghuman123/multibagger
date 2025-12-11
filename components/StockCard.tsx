import React from 'react';

export const MultibaggerBadge: React.FC<{ score: number }> = ({ score }) => {
    const getColor = () => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 65) return 'bg-green-500';
        if (score >= 50) return 'bg-yellow-500';
        if (score >= 35) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getLabel = () => {
        if (score >= 80) return 'Elite';
        if (score >= 65) return 'Strong';
        if (score >= 50) return 'Moderate';
        if (score >= 35) return 'Weak';
        return 'Avoid';
    };

    return (
        <div className={`${getColor()} px-3 py-1 rounded-full text-white font-bold inline-flex items-center gap-2`}>
            <span>{score}/100</span>
            <span className="opacity-90 font-normal border-l border-white/20 pl-2 text-xs uppercase tracking-wide">{getLabel()}</span>
        </div>
    );
};

export const GradeDisplay: React.FC<{
    quality?: string,
    growth?: string,
    valuation?: string,
    momentum?: string
}> = ({ quality = 'C', growth = 'C', valuation = 'C', momentum = 'C' }) => {
    const gradeColor = (g: string) => {
        if (g === 'A') return 'text-emerald-500';
        if (g === 'B') return 'text-green-500';
        if (g === 'C') return 'text-yellow-500';
        if (g === 'D') return 'text-orange-500';
        return 'text-red-500';
    };

    return (
        <div className="grid grid-cols-4 gap-4 text-center bg-gray-950/50 p-4 rounded-xl border border-gray-800/50">
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Quality</div>
                <div className={`text-2xl font-bold ${gradeColor(quality)}`}>{quality}</div>
            </div>
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Growth</div>
                <div className={`text-2xl font-bold ${gradeColor(growth)}`}>{growth}</div>
            </div>
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Value</div>
                <div className={`text-2xl font-bold ${gradeColor(valuation)}`}>{valuation}</div>
            </div>
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Momtm</div>
                <div className={`text-2xl font-bold ${gradeColor(momentum)}`}>{momentum}</div>
            </div>
        </div>
    );
};

// Main card component if needed for lists
export const StockCard: React.FC<{
    ticker: string;
    name: string;
    score: number;
    grades: { q: string, g: string, v: string, m: string };
    price: string;
    change: string;
}> = ({ ticker, name, score, grades, price, change }) => {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors group">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-2xl font-bold text-white group-hover:text-primary-400 transition-colors">{ticker}</h3>
                    <p className="text-sm text-gray-500 truncate max-w-[150px]">{name}</p>
                </div>
                <MultibaggerBadge score={score} />
            </div>

            <div className="mb-6">
                <div className="text-3xl font-mono font-bold text-white mb-1">{price}</div>
                <div className={`text-sm font-medium ${change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                    {change}
                </div>
            </div>

            <GradeDisplay
                quality={grades.q}
                growth={grades.g}
                valuation={grades.v}
                momentum={grades.m}
            />
        </div>
    );
}
