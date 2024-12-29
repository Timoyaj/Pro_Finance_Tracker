import { useState, useCallback } from 'react';
import debounce from 'lodash/debounce';

const ITEMS_PER_PAGE = 10;

const TransactionList = ({ transactions, onEdit, filters }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedEdit = useCallback(
    debounce((transaction) => {
      onEdit(transaction);
    }, 300),
    []
  );

  const filteredTransactions = useCallback(() => {
    return transactions.filter(t => {
      if (filters.category && t.category !== filters.category) return false;
      if (filters.date && new Date(t.date).toDateString() !== new Date(filters.date).toDateString()) return false;
      return true;
    });
  }, [transactions, filters]);

  const paginatedTransactions = () => {
    const filtered = filteredTransactions();
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  };

  const totalPages = Math.ceil(filteredTransactions().length / ITEMS_PER_PAGE);

  const handleEdit = async (transaction) => {
    setIsLoading(true);
    await debouncedEdit(transaction);
    setIsLoading(false);
  };

  return (
    <div className="transaction-list">
      {isLoading && <div className="loading-spinner">Loading...</div>}
      
      {paginatedTransactions().map(transaction => (
        <div key={transaction.id} className="transaction-item">
          {/* Transaction display logic */}
        </div>
      ))}

      <div className="pagination">
        <button 
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(prev => prev - 1)}
        >
          Previous
        </button>
        <span>{currentPage} of {totalPages}</span>
        <button 
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(prev => prev + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default TransactionList;
