
import { useState, useEffect } from 'react';

const Budget = ({ initialBudget, onUpdate }) => {
  const [budget, setBudget] = useState(initialBudget);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setBudget(initialBudget);
  }, [initialBudget]);

  const handleUpdate = async (updatedBudget) => {
    try {
      setIsUpdating(true);
      setError(null);
      await onUpdate(updatedBudget);
      setBudget(updatedBudget);
    } catch (err) {
      setError('Failed to update budget. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="budget-container">
      {error && <div className="error-message">{error}</div>}
      {isUpdating && <div className="loading-spinner">Updating...</div>}
      
      <form onSubmit={(e) => {
        e.preventDefault();
        handleUpdate(budget);
      }}>
        {/* Budget form fields */}
      </form>
    </div>
  );
};

export default Budget;