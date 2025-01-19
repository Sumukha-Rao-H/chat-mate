    import React, { useState, useEffect, useRef } from "react";
    import { getAuth } from "firebase/auth";
    import Header from "../components/Navbar";
    import Footer from "../components/Footer";
    import socket from "../socket"; // Import the socket instance
    import Sidebar from "../components/HomePageComponents/Sidebar";
    import ChatWindow from "../components/HomePageComponents/ChatWindow";
    import { encryptMessage, decryptMessage } from "../functions/encryption"
    import { verifyOrGenerateKeysForUser, getPrivateKey } from "../functions/generateKeyPair"
    import { PhoneIcon, VideoCameraIcon, PaperClipIcon, MicrophoneIcon, SpeakerXMarkIcon, PhoneXMarkIcon } from '@heroicons/react/24/outline';

    const Home = () => {
        const auth = getAuth();
        const curUser = auth.currentUser;
        const [activeConversation, setActiveConversation] = useState(null);
        const [loading, setLoading] = useState(false);
        const [messages, setMessages] = useState([]); // Store chat messages
        const [newMessage, setNewMessage] = useState(""); // Input for new message
        const [isSidebarOpen, setIsSidebarOpen] = useState(false); // State for sidebar visibility
        const [hasMore, setHasMore] = useState(true);
        const [page, setPage] = useState(1);
        const chatContainerRef = useRef(null);
        const lastMessageRef = useRef(null);
        const [isVideoCalling, setIsVideoCalling] = useState(false);
        const [isAudioCalling, setIsAudioCalling] = useState(false);
        const [isMuted, setIsMuted] = useState(false);
        const [isVideoOff, setIsVideoOff] = useState(false);

        const handleMute = () => {
            setIsMuted((prevState) => !prevState); // Toggle mute state
        };

        const handleTurnOffVideo = () => setIsVideoOff((prev) => !prev);

        useEffect(() => {
            if (curUser) {
                verifyOrGenerateKeysForUser(curUser.uid); // Ensure the user has a key pair
            }

            // Listen for incoming messages
            socket.on("receiveMessage", async (message) => {
                try {
                    if (message.senderId !== curUser.uid) {
                        // Decrypt the message using the private key
                        const privateKey = await getPrivateKey(curUser.uid);
                        const decryptedMessage = await decryptMessage(privateKey, message.messageR);
                        setMessages((prevMessages) => [
                            ...prevMessages,
                            { ...message, message: decryptedMessage }, // Update with decrypted content
                        ]);
                    }
                } catch (error) {
                    console.error("Error decrypting message:", error);
                }
            });

            return () => {
                socket.off("receiveMessage");
            };
        }, [curUser]);

        
        const fetchMessages = async (page) => {
            try {
                const privateKey = await getPrivateKey(curUser.uid);
                const response = await fetch(
                    `${process.env.REACT_APP_SERVER_URL}/api/messages?userId1=${curUser.uid}&userId2=${activeConversation.uid}&page=${page}&limit=20`
                );
                if (!response.ok) throw new Error("Failed to fetch messages");
                const data = await response.json();
        
                const decryptedMessages = await Promise.all(
                    data.messages.map(async (msg, index) => {
                        let encryptedMessage;
        
                        if (msg.senderId === curUser.uid) {
                            // Current user is the sender; use messageS
                            encryptedMessage = msg.messageS;
                        } else if (msg.receiverId === curUser.uid) {
                            // Current user is the receiver; use messageR
                            encryptedMessage = msg.messageR;
                        } else {
                            console.log(`Message ${index + 1} does not belong to this conversation`);
                            return { ...msg, message: "Message not available" }; // Fallback
                        }
        
                        // Check if the message is encrypted
                        if (!encryptedMessage) {
                            console.log(`Message is missing for message ${index + 1}`);
                            return { ...msg, message: "Message not available" }; // Fallback
                        }
                        const decryptedMessage = await decryptMessage(privateKey, encryptedMessage);
                        return {
                            ...msg,
                            message: decryptedMessage,
                        };
                    })
                );
        
                setMessages((prevMessages) => [...decryptedMessages.reverse(), ...prevMessages]);
                setHasMore(data.hasMore);
            } catch (error) {
                console.error("Error fetching messages:", error);
            }
        };

        const scrollToBottom = () => {
            if (chatContainerRef.current) {
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
        };
        
        useEffect(() => {
            if (messages.length > 0 || activeConversation) {
                scrollToBottom();
            }
        }, [messages, activeConversation]);
        
        useEffect(() => {
            if(activeConversation) {
                fetchMessages(page);
            }
        }, [activeConversation, page]);

        const handleSelectConversation = (friend) => {
            setActiveConversation(friend);
            setMessages([]); // Clear previous messages
            setPage(1);
            setHasMore(true);

            // Join a room with the friend
            socket.emit("joinRoom", {
                senderId: curUser.uid,
                receiverId: friend.uid,
            });
            scrollToBottom();
        };

        const handleScroll = () => {
            if (
                chatContainerRef.current.scrollTop === 0 &&
                hasMore &&
                !loading
            ) {
                setPage((prevPage) => prevPage + 1);
            }
        };

        const handleSendMessage = async () => {
            if (newMessage.trim() === "") return;
        
            try {
                // Fetch the recipient's public key
                const receiverKeyResponse = await fetch(`${process.env.REACT_APP_SERVER_URL}/api/getPublicKey/${activeConversation.uid}`);
                if (!receiverKeyResponse.ok) throw new Error("Failed to fetch receiver's public key");
                const { publicKey: receiverPublicKey } = await receiverKeyResponse.json();
        
                // Fetch the sender's public key
                const senderKeyResponse = await fetch(`${process.env.REACT_APP_SERVER_URL}/api/getPublicKey/${curUser.uid}`);
                if (!senderKeyResponse.ok) throw new Error("Failed to fetch sender's public key");
                const { publicKey: senderPublicKey } = await senderKeyResponse.json();
        
                // Encrypt the message with the recipient's public key (messageR)
                const encryptedMessageR = await encryptMessage(receiverPublicKey, newMessage);
        
                // Encrypt the message with the sender's public key (messageS)
                const encryptedMessageS = await encryptMessage(senderPublicKey, newMessage);
        
                const message = {
                    senderId: curUser.uid,
                    receiverId: activeConversation.uid,
                    messageS: encryptedMessageS,
                    messageR: encryptedMessageR,
                };
        
                // Emit the message to the backend
                socket.emit("sendMessage", message);
        
                // Add the original message to the local state for display purposes
                setMessages((prevMessages) => [
                    ...prevMessages,
                    { ...message, message: newMessage },
                ]);
                setNewMessage("");

                if (lastMessageRef.current) {
                    lastMessageRef.current.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                    });
                }
                scrollToBottom();
            } catch (error) {
                console.error("Error sending message:", error);
            }
        };
        

        const handleBackToConversations = () => {
            setActiveConversation(null); // Reset the active conversation
            setMessages([]); // Clear messages
        };

        if (!curUser) {
            return <div>Loading...</div>;
        }

        const handleVideoCall = () => {
            setIsVideoCalling(true);
            setIsAudioCalling(false); // Ensure only one type of call is active
        };
        
        const handleAudioCall = () => {
            setIsAudioCalling(true);
            setIsVideoCalling(false); // Ensure only one type of call is active
        };
        
        const handleEndCall = () => {
            setIsVideoCalling(false);
            setIsAudioCalling(false);
        };

        return (
            <>
                <Header />
                <div className="flex flex-col min-h-screen overflow-hidden bg-gray-50">
                    <div className="flex flex-col pt-12">
                        <div className="flex">
                            {/* Desktop View: Sidebar and Chat Window */}
                            <div className="hidden md:flex w-full h-screen">
                                <Sidebar 
                                    handleSelectConversation={handleSelectConversation}
                                />

                                <ChatWindow
                                        activeConversation={activeConversation}
                                        handleAudioCall={handleAudioCall}
                                        handleVideoCall={handleVideoCall}
                                        isAudioCalling={isAudioCalling}
                                        isMuted={isMuted}
                                        isVideoCalling={isVideoCalling}
                                        isVideoOff={isVideoOff}
                                        handleMute={handleMute}
                                        handleEndCall={handleEndCall}
                                        messages={messages}
                                        curUser={curUser}
                                        handleScroll={handleScroll}
                                        chatContainerRef={chatContainerRef}
                                        lastMessageRef={lastMessageRef}
                                        newMessage={newMessage}
                                        setNewMessage={setNewMessage}
                                        handleSendMessage={handleSendMessage}
                                        fetchMessages={fetchMessages}
                                        page={page}
                                    />

                            </div>


                            {/* Mobile View: No Sidebar, only Conversations and Chat Window */}
                            <div className="flex-1 md:hidden flex flex-col">
                                {/* Chat Window with Back Button */}
                                {activeConversation ? (
                                    <>
                                        <ChatWindow
                                            activeConversation={activeConversation}
                                            handleAudioCall={handleAudioCall}
                                            handleVideoCall={handleVideoCall}
                                            isAudioCalling={isAudioCalling}
                                            isMuted={isMuted}
                                            isVideoCalling={isVideoCalling}
                                            isVideoOff={isVideoOff}
                                            handleMute={handleMute}
                                            handleEndCall={handleEndCall}
                                            messages={messages}
                                            curUser={curUser}
                                            handleScroll={handleScroll}
                                            chatContainerRef={chatContainerRef}
                                            lastMessageRef={lastMessageRef}
                                            newMessage={newMessage}
                                            setNewMessage={setNewMessage}
                                            handleSendMessage={handleSendMessage}
                                            fetchMessages={fetchMessages}
                                            page={page}
                                            handleBackToConversations={handleBackToConversations}
                                        />
                                    </>
                                ) : (
                                    <Sidebar 
                                        handleSelectConversation={handleSelectConversation}
                                    />
                                )}
                            </div>

                        </div>
                    </div>
                    <Footer />
                </div>
            </>
        );
    };

    export default Home;
