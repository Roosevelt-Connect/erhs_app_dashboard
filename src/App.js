import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  db, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, arrayUnion, getDoc, setDoc
} from './firebase';
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import 'bootstrap/dist/css/bootstrap.min.css';
import {
  Container, Row, Col, Card, Button, Spinner, Form, Modal, Nav, Navbar
} from 'react-bootstrap';
import { query, where } from "firebase/firestore";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";


const getTeacherUseCount = async (teacherName, startDate, endDate) => {
  const collectionRef = collection(db, "student_check-in_datalogs");
  console.log("Querying for:", teacherName, startDate, endDate);
  const q = query(
    collectionRef,
    where("teacher", "==", teacherName),
    where("timestamp", ">=", startDate),
    where("timestamp", "<=", endDate)
  );
  // const q = query(
  //   collectionRef,
  //   where("teacher", "==", teacherName)
  // );
  try {
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (err) {
    console.error("Error fetching teacher usage: ", err);
    return 0;
  }
};

const formatDateString = (date, endOfDay = false) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${endOfDay ? '23:59:59' : '00:00:00'}`;
};

const EventsClubsPage = () => {
  const [activeTab, setActiveTab] = useState('events');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemData, setItemData] = useState({});
  const [editingItem, setEditingItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [bulkIds, setBulkIds] = useState('');
  const [imageUrls, setImageUrls] = useState({});
  const storage = getStorage();
  const imageUrlsRef = useRef({});
  const [teachers, setTeachers] = useState([]);
  const [usage, setUsage] = useState({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageStartDate, setUsageStartDate] = useState(null);
  const [usageEndDate, setUsageEndDate] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = getAuth();

  const getImageURL = useCallback(async (imagePath) => {
    if (imageUrlsRef.current[imagePath]) return;
    try {
      const imageRef = ref(storage, imagePath);
      const url = await getDownloadURL(imageRef);
      imageUrlsRef.current[imagePath] = url;
      setImageUrls(prev => ({ ...prev, [imagePath]: url }));
    } catch (error) {
      console.error("Error fetching image URL:", error);
    }
  }, [storage]);

  const handleBulkIdsChange = (e) => setBulkIds(e.target.value);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setItemData(prevData => ({ ...prevData, [name]: value }));
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    const ids = bulkIds.split(/[\n,]+/).map(id => id.trim()).filter(id => id);
    if (!ids.length) return alert("Please enter at least one ID.");

    const docRef = doc(db, "event_participants", "approved_ids");
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const existingIds = docSnap.data()?.ids || [];
        const newIds = ids.map(id => Number(id)).filter(id => !existingIds.includes(id));
        if (newIds.length) {
          await updateDoc(docRef, { ids: arrayUnion(...newIds) });
          setItems(prev => [...prev, ...newIds.map(id => ({ id }))]);
          setBulkIds('');
          alert(`Successfully added ${newIds.length} new IDs.`);
        } else {
          alert("All IDs are already in the list.");
        }
      } else {
        const newIds = ids.map(id => Number(id));
        await setDoc(docRef, { ids: newIds });
        setItems(prev => [...prev, ...newIds.map(id => ({ id }))]);
        setBulkIds('');
        alert(`Successfully created approved_ids and added ${newIds.length} new IDs.`);
      }
    } catch (error) {
      console.error("Error adding IDs:", error);
      alert("Error adding IDs.");
    }
  };

  const fetchItems = useCallback(async () => {
    if (activeTab === "Scan Usage") return; // Don't fetch items for Scan Usage tab
    try {
      setLoading(true);
      const collectionRef = collection(db, activeTab);
      const snapshot = await getDocs(collectionRef);
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        // Remove any 'id' field from the document data to avoid overwriting
        const { id, ...rest } = docData;
        return { id: doc.id, ...rest };
      });
      setItems(data);
      setLoading(false);
      data.forEach(item => item.image && getImageURL(item.image));
    } catch (err) {
      console.error("Error fetching items:", err);
      setLoading(false);
    }
  }, [activeTab, getImageURL]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Fetch unique teacher names for Scan Usage tab
  useEffect(() => {
    if (activeTab !== "Scan Usage") return;
    const fetchTeachers = async () => {
      setUsageLoading(true);
      const collectionRef = collection(db, "student_check-in_datalogs");
      const snapshot = await getDocs(collectionRef);
      const teacherSet = new Set();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.teacher) teacherSet.add(data.teacher);
      });
      setTeachers(Array.from(teacherSet));
      setUsageLoading(false);
    };
    fetchTeachers();
  }, [activeTab]);

  // Fetch usage counts for all teachers
  const fetchUsage = async () => {
    if (!usageStartDate || !usageEndDate) return;
    setUsageLoading(true);
    const startStr = formatDateString(usageStartDate, false);
    const endStr = formatDateString(usageEndDate, true);
    const results = {};
    for (const teacher of teachers) {
      results[teacher] = await getTeacherUseCount(teacher, startStr, endStr);
    }
    setUsage(results);
    setUsageLoading(false);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();

    let updatedItemData = {
      ...itemData,
      type: (activeTab === "clubs" || activeTab === "FineArts" || activeTab === "tutor") ? "school" :
        (activeTab === "events" || activeTab === "athletics") ? "volunteer" :
          itemData.type || ""
    };

    // If adding or editing a tutor, use imgPath instead of image
    if (activeTab === "tutor") {
      updatedItemData = {
        ...updatedItemData,
        imgPath: updatedItemData.image,
      };
      delete updatedItemData.image;
    }

    try {
      if (activeTab === "event_participants") {
        const docRef = doc(db, "event_participants", "approved_ids");
        const docSnap = await getDoc(docRef);
        const newId = Number(updatedItemData.id);

        if (docSnap.exists()) {
          const existingIds = docSnap.data()?.ids || [];
          if (!existingIds.includes(newId)) {
            await updateDoc(docRef, { ids: arrayUnion(newId) });
            setItems([...items, { id: newId }]);
          } else {
            alert("ID already exists.");
          }
        } else {
          await setDoc(docRef, { ids: [newId] });
          setItems([...items, { id: newId }]);
          alert("Created approved_ids and added the new ID.");
        }
      } else if (editingItem) {
        // EDIT MODE: update the existing document
        const docRef = doc(db, activeTab, editingItem.id);
        await updateDoc(docRef, updatedItemData);
        setItems(items.map(item =>
          item.id === editingItem.id ? { ...item, ...updatedItemData } : item
        ));
      } else {
        // ADD MODE: create a new document
        const newDocRef = await addDoc(collection(db, activeTab), updatedItemData);
        console.log("Added tutor with Firestore ID:", newDocRef.id);
        setItems([...items, { id: newDocRef.id, ...updatedItemData }]);
      }

      resetForm();
    } catch (err) {
      console.error("Full error object:", err);
      alert(`Error: ${err.message}`);
      setError(`Error adding ${activeTab}`);
    }
  };

  const handleDeleteItem = async (id) => {
    const docRef = doc(db, activeTab, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      console.warn(`Document with id "${id}" does NOT exist in collection "${activeTab}"`);
      alert(`Document not found in Firestore!`);
      return;
    } else {
      console.log(`Document with id "${id}" exists in collection "${activeTab}"`);
    }
    try {
      console.log("Attempting to delete tutor with ID:", id);
      await deleteDoc(docRef);
      setItems(items.filter(item => item.id !== id));
    } catch (err) {
      console.error("Error deleting item:", err);
      alert("Error deleting item.");
    }
  };

  const handleOpenModal = (item = null) => {
    setEditingItem(item);
    if (activeTab === "tutor" && item) {
      setItemData({
        ...item,
        image: item.imgPath || '', // Map imgPath to image for the form
      });
    } else {
      setItemData(item || {
        name: '', description: '', day: '', month: '', year: '',
        type: '', image: '', website: '', mail: '', instagram: '', uid: ''
      });
    }
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingItem(null);
    setItemData({
      name: '', description: '', day: '', month: '', year: '',
      type: '', image: '', website: '', mail: '', instagram: '', uid: '', subject: ''
    });
    setShowModal(false);
  };

  const formatDate = (day, month, year) => (day && month && year) ? `${month} ${day}, ${year}` : '';

  const handleSubmit = (e) => {
    e.preventDefault();
    activeTab === "event_participants" && bulkIds ? handleBulkAdd(e) : handleAddItem(e);
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe();
  }, [auth]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError('Invalid email or password.');
    }
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!user) {
    return (
      <Container className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <Card className="p-4 shadow" style={{ maxWidth: 400, width: "100%" }}>
          <h2 className="mb-3 text-center">Sign In</h2>
          <Form onSubmit={handleSignIn}>
            <Form.Group className="mb-3" controlId="formEmail">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={authLoading}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={authLoading}
              />
            </Form.Group>
            {authError && <div className="text-danger mb-2">{authError}</div>}
            <Button variant="primary" type="submit" className="w-100" disabled={authLoading}>
              {authLoading ? <Spinner animation="border" size="sm" /> : "Sign In"}
            </Button>
          </Form>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="position-relative">
      <Navbar bg="light" expand="lg" className="mb-3">
        <Container>
          <Navbar.Brand>Event Editor</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>
              Signed in as: <b>{user.email}</b>
            </Navbar.Text>
            <Button variant="outline-danger" size="sm" className="ms-3" onClick={handleSignOut}>
              Sign Out
            </Button>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <h1 className="text-center my-4">Manage Events & Clubs</h1>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <Nav variant="tabs" activeKey={activeTab} onSelect={setActiveTab}>
          <Nav.Item><Nav.Link eventKey="events">Events</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="clubs">Clubs</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="FineArts">FineArts</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="athletics">Athletics</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="tutor">Tutors</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="event_participants">Id List</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="Scan Usage">Scan Usage</Nav.Link></Nav.Item>
        </Nav>
        {activeTab !== "event_participants" && activeTab !== "Scan Usage" && (
          <Button variant="success" onClick={() => handleOpenModal()}>Add Item</Button>
        )}
      </div>

      {activeTab === "Scan Usage" ? (
        <div>
          <h2 className="my-4 text-center">Teacher Scan Usage</h2>
          <Form className="mb-3 d-flex flex-wrap gap-2 justify-content-center align-items-end">
            <Form.Group>
              <Form.Label>Start Date</Form.Label>
              <div>
                <DatePicker
                  selected={usageStartDate}
                  onChange={date => setUsageStartDate(date)}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Select start date"
                  className="form-control"
                  maxDate={usageEndDate || undefined}
                  isClearable
                />
              </div>
            </Form.Group>
            <Form.Group>
              <Form.Label>End Date</Form.Label>
              <div>
                <DatePicker
                  selected={usageEndDate}
                  onChange={date => setUsageEndDate(date)}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Select end date"
                  className="form-control"
                  minDate={usageStartDate || undefined}
                  isClearable
                />
              </div>
            </Form.Group>
            <Button variant="primary" onClick={fetchUsage} disabled={usageLoading || !usageStartDate || !usageEndDate}>
              {usageLoading ? <Spinner animation="border" size="sm" /> : "Fetch Usage"}
            </Button>
          </Form>
          <div>
            {usageLoading ? (
              <Spinner animation="border" />
            ) : (
              <table className="table table-bordered">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Check-in Count</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(teacher => (
                    <tr key={teacher}>
                      <td>{teacher}</td>
                      <td>{usage[teacher] ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ height: "50vh" }}>
          <Spinner animation="border" variant="primary" />
        </div>
      ) : error ? (
        <div className="text-center text-danger">{error}</div>
      ) : (
        <Row>
          {items.map(item => (
            <Col key={item.id} md={4} className="mb-4">
              <Card className="shadow-sm h-100">
                {item.image && imageUrls[item.image] && (
                  <Card.Img variant="top" src={imageUrls[item.image]} alt={item.name} style={{ height: '200px', objectFit: 'cover' }} />
                )}
                <Card.Body className="d-flex flex-column">
                  <Card.Title>{item.name || item.id}</Card.Title>
                  {activeTab !== 'event_participants' && (
                    <>
                      <Card.Text>{item.description}</Card.Text>
                      {activeTab !== 'tutor' && (
                        <>
                          <Card.Text><strong>{formatDate(item.day, item.month, item.year)}</strong></Card.Text>
                          <Card.Text>{item.website && <a href={item.website} target="_blank" rel="noopener noreferrer">Visit Website</a>}</Card.Text>
                        </>
                      )}
                      {activeTab === 'events' && item.type && <Card.Text><strong>Type:</strong> {item.type}</Card.Text>}
                      {item.mail && <Card.Text><strong>Contact:</strong> {item.mail}</Card.Text>}
                      {activeTab === 'tutor' && item.subject && <Card.Text><strong>Subject:</strong> {item.subject}</Card.Text>}
                    </>
                  )}
                  <div className="mt-auto d-flex justify-content-between">
                    <Button variant="warning" className="btn-sm" onClick={() => handleOpenModal(item)}>Edit</Button>
                    <Button variant="danger" className="btn-sm" onClick={() => handleDeleteItem(item.id)}>Delete</Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal show={showModal} onHide={resetForm}>
        <Modal.Header closeButton>
          <Modal.Title>{editingItem ? 'Edit Item' : 'Add New Item'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            {activeTab === "event_participants" ? (
              <Form.Group controlId="formBulkIds">
                <Form.Label>Bulk IDs</Form.Label>
                <Form.Control as="textarea" rows={3} value={bulkIds} onChange={handleBulkIdsChange} />
              </Form.Group>
            ) : (
              <>
                <Form.Group controlId="formName">
                  <Form.Label>Name</Form.Label>
                  <Form.Control type="text" name="name" value={itemData.name || ''} onChange={handleChange} />
                </Form.Group>
                <Form.Group controlId="formDescription">
                  <Form.Label>Description</Form.Label>
                  <Form.Control as="textarea" rows={3} name="description" value={itemData.description || ''} onChange={handleChange} />
                </Form.Group>
                {activeTab === "events" && (
                  <Form.Group controlId="formType">
                    <Form.Label>Type</Form.Label>
                    <Form.Control type="text" name="type" value={itemData.type || ''} onChange={handleChange} placeholder="e.g., volunteer, school" />
                  </Form.Group>
                )}
                {activeTab !== 'tutor' && (
                  <>
                    <Form.Group controlId="formDate">
                      <Form.Label>Date</Form.Label>
                      <Row>
                        <Col><Form.Control type="number" name="day" value={itemData.day || ''} onChange={handleChange} placeholder="Day" /></Col>
                        <Col><Form.Control type="text" name="month" value={itemData.month || ''} onChange={handleChange} placeholder="Month" /></Col>
                        <Col><Form.Control type="number" name="year" value={itemData.year || ''} onChange={handleChange} placeholder="Year" /></Col>
                      </Row>
                    </Form.Group>
                    <Form.Group controlId="formWebsite">
                      <Form.Label>Website</Form.Label>
                      <Form.Control type="text" name="website" value={itemData.website || ''} onChange={handleChange} />
                    </Form.Group>
                  </>
                )}
                {activeTab === 'tutor' && (
                  <>
                    <Form.Group controlId="formSubject">
                      <Form.Label>Subject</Form.Label>
                      <Form.Control type="text" name="subject" value={itemData.subject || ''} onChange={handleChange} />
                    </Form.Group>
                    <Form.Group controlId="formUid">
                      <Form.Label>User ID (UID)</Form.Label>
                      <Form.Control type="text" name="uid" value={itemData.uid || ''} onChange={handleChange} />
                    </Form.Group>
                  </>
                )}
                <Form.Group controlId="formImage">
                  <Form.Label>Image URL</Form.Label>
                  <Form.Control type="text" name="image" value={itemData.image || ''} onChange={handleChange} />
                </Form.Group>
                <Form.Group controlId="formMail">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="text" name="mail" value={itemData.mail || ''} onChange={handleChange} />
                </Form.Group>
                <Form.Group controlId="formInstagram">
                  <Form.Label>Instagram</Form.Label>
                  <Form.Control type="text" name="instagram" value={itemData.instagram || ''} onChange={handleChange} />
                </Form.Group>
              </>
            )}
            <Button variant="primary" type="submit" className="mt-3 w-100">
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default EventsClubsPage;
