import { useState, useEffect } from 'react';

const GoalTracker = ({ goal, transactions }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [monthlyNeeded, setMonthlyNeeded] = useState(0);

  useEffect(() => {
    calculateProgress();
  }, [goal, transactions]);

  const calculateProgress = () => {
    const linkedTransactions = transactions.filter(t => t.goalId === goal.id);
    const totalSaved = linkedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const progressPercent = (totalSaved / goal.targetAmount) * 100;
    
    setProgress(progressPercent);
    calculateStatus(progressPercent);
    calculateMonthlyContribution(totalSaved);
  };

  const calculateStatus = (currentProgress) => {
    const timeLeft = new Date(goal.targetDate) - new Date();
    const monthsLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24 * 30));
    
    if (currentProgress >= 90) setStatus('On Track');
    else if (currentProgress >= 70) setStatus('At Risk');
    else setStatus('Behind');

    return status;
  };

  const calculateMonthlyContribution = (totalSaved) => {
    const timeLeft = new Date(goal.targetDate) - new Date();
    const monthsLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24 * 30));
    const remaining = goal.targetAmount - totalSaved;
    
    setMonthlyNeeded(remaining / monthsLeft);
  };

  return (
    <div className="goal-tracker">
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }}>
          {progress.toFixed(2)}%
        </div>
      </div>
      <div className="status">Status: {status}</div>
      <div className="monthly-needed">
        Monthly Contribution Needed: ${monthlyNeeded.toFixed(2)}
      </div>
    </div>
  );
};

export default GoalTracker;
