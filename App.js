import { StatusBar } from 'expo-status-bar';
import { initializeApp } from 'firebase/app';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import React, { useState, useEffect } from 'react';
import { View, TextInput, FlatList, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { getDatabase, ref, push, onValue } from 'firebase/database';

// Configurações do Firebase
const firebaseConfig = {

};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Função para formatar o timestamp (hora e minuto)
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Função para solicitar permissões e obter o token do dispositivo
const registerForPushNotificationsAsync = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }

  const token = await Notifications.getExpoPushTokenAsync();
  console.log('Expo Push Token:', token);

  // Você pode enviar esse token para seu backend e registrá-lo para notificações
  // Exemplo de envio do token (opcional):
  // fetch('https://your-backend.com/register-token', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ token }),
  // });
};

// Defina uma tarefa de background para buscar novos dados
TaskManager.defineTask('BACKGROUND_FETCH_TASK', async () => {
  try {
    const response = await fetch('https://expower-dc899-default-rtdb.firebaseio.com/messages.json');
    const data = await response.json();
    
    if (data) {
      const messageList = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      
      // Se houver novas mensagens, você pode agendar uma notificação
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Nova Mensagem!',
          body: `Você tem novas mensagens.`,
        },
        trigger: null, // Imediatamente
      });
    }
    
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    console.error(error);
    return BackgroundFetch.Result.Failed;
  }
});

export default function App() {
  const [username, setUsername] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    registerForPushNotificationsAsync();

    // Solicitar permissões e configurar o token
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification Received:', notification);
    });

    // Escuta as mensagens em tempo real
    const messagesRef = ref(database, 'messages');
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      const messageList = data
        ? Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }))
        : [];
      setMessages(messageList);

      // Enviar uma notificação quando uma nova mensagem for recebida
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Nova Mensagem!',
          body: `Mensagem de ${messageList[messageList.length - 1]?.username}: ${messageList[messageList.length - 1]?.text}`,
        },
        trigger: null, // Imediatamente
      });
    });

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Registrar o fetch em background
    BackgroundFetch.registerTaskAsync('BACKGROUND_FETCH_TASK', {
      minimumInterval: 15 * 60, // Intervalo mínimo em segundos
      stopOnTerminate: false, // Continuar após o aplicativo ser fechado
      startOnBoot: true, // Iniciar após o dispositivo ser reiniciado
    });

    return () => {
      BackgroundFetch.unregisterTaskAsync('BACKGROUND_FETCH_TASK');
    };
  }, []);

  // Envia a mensagem para o Firebase com username e hora/minuto
  const sendMessage = () => {
    if (message.length > 0) {
      const messagesRef = ref(database, 'messages');
      const timestamp = Date.now(); // Pega o timestamp atual
      push(messagesRef, {
        text: message,
        username: username,  // Adiciona o nome de usuário
        time: formatTime(timestamp),  // Formata a hora e minuto
        timestamp: timestamp,
      });
      setMessage(''); // Limpar o campo após o envio
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Modal para inserir o nome de usuário */}
      <Modal visible={!isUsernameSet} animationType="slide" transparent={true}>
        <View style={styles.usernameContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite seu nome de usuário"
            value={username}
            onChangeText={text => setUsername(text)}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (username.trim().length > 0) {
                setIsUsernameSet(true);
              }
            }}
          >
            <Text style={styles.buttonText}>Confirmar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>
              <Text style={styles.usernameText}>{item.username} ({item.time}):</Text>  {item.text}
            </Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
      />
      <TextInput
        style={styles.input}
        placeholder="Digite sua mensagem"
        value={message}
        onChangeText={text => setMessage(text)}
      />
      <TouchableOpacity style={styles.button} onPress={sendMessage}>
        <Text style={styles.buttonText}>Enviar Mensagem</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'purple',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 10,
    backgroundColor: 'white',
    borderRadius: 25,
  },
  messagesList: {
    flex: 1,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#6200EE',
    padding: 10,
    alignItems: 'center',
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  messageText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 5,
    backgroundColor: 'black',
    borderRadius: 25,
    padding: 10,
    flexWrap: 'wrap',
  },
  usernameText: {
    color: '#ffeb3b',
    fontWeight: 'bold',
    marginRight: 5,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    maxWidth: '90%',
  },
  usernameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
});
