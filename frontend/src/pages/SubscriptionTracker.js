import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, IconButton, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { NotificationImportant, Edit, Delete } from '@mui/icons-material';
import { useSelector } from 'react-redux';

const getStatusColor = (status) => {
  return status === 'Active' ? 'success' : 'warning';
};

const SubscriptionTracker = () => {
  const { token } = useSelector((state) => state.auth);
  const [subscriptions, setSubscriptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', vendor_id: '', cost: '', billing_cycle: 'Monthly', next_renewal_date: '' });
  const fetchSubscriptions = async () => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/subscriptions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Add a simple status logic based on date
        const mapped = data.map(sub => {
          const daysLeft = (new Date(sub.next_renewal_date) - new Date()) / (1000 * 60 * 60 * 24);
          return { ...sub, status: daysLeft <= 14 ? 'Expiring Soon' : 'Active' };
        });
        setSubscriptions(mapped);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleSubmit = async () => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setOpen(false);
        fetchSubscriptions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4">Subscription Tracker</Typography>
        <Button variant="contained" color="primary" onClick={() => setOpen(true)}>Add Subscription</Button>
      </Box>
      
      <TableContainer component={Paper} sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell>App Name</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Cost</TableCell>
              <TableCell>Billing Cycle</TableCell>
              <TableCell>Next Renewal</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subscriptions.length === 0 && <TableRow><TableCell colSpan={7} align="center">No subscriptions found</TableCell></TableRow>}
            {subscriptions.map((row) => {
              const isUrgent = row.status === 'Expiring Soon';
              return (
                <TableRow key={row.id} sx={{ backgroundColor: isUrgent ? 'rgba(244, 67, 54, 0.1)' : 'transparent', '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                  <TableCell>
                    <Typography variant="body1" fontWeight={600}>
                      {isUrgent && <NotificationImportant color="error" sx={{ fontSize: 18, mr: 1, verticalAlign: 'sub' }}/>}
                      {row.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{row.vendor_id}</TableCell>
                  <TableCell fontWeight="bold" color="primary.light">${row.cost}</TableCell>
                  <TableCell>{row.billing_cycle}</TableCell>
                  <TableCell>{row.next_renewal_date}</TableCell>
                  <TableCell align="center">
                    <Chip label={row.status} color={getStatusColor(row.status)} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="primary"><Edit /></IconButton>
                    <IconButton size="small" color="error"><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Add Subscription</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2, minWidth: 400 }}>
          <TextField label="App Name" fullWidth value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <TextField label="Vendor" fullWidth value={formData.vendor_id} onChange={e => setFormData({...formData, vendor_id: e.target.value})} />
          <TextField label="Cost" type="number" fullWidth value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} />
          <TextField label="Next Renewal Date" type="date" InputLabelProps={{ shrink: true }} fullWidth value={formData.next_renewal_date} onChange={e => setFormData({...formData, next_renewal_date: e.target.value})} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubscriptionTracker;
