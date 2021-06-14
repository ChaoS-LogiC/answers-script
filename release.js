// ==UserScript==
// @name         Mirea Ninja Answers
// @namespace    https://mirea.ninja/
// @version      1.0
// @description  online test answers!
// @author       admin
// @match        https://online-edu.mirea.ru/*
// @match        http://oniel.beget.tech/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/crypto-js.min.js
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.1.2/socket.io.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    $(document).ready(function () {
        // match - вопрос на соответствие, 
        // multichoice - вопрос с множественными вариантами ответов,
        // multichoice_checkbox - множество вариантов, ответить можно несколько
        // shortanswer - вписать короткий ответ, 
        // truefalse - вопрос на верно/неверно
        var questionsBlocks = '.que';
        const questionsType = getQuestionsType();
        const questionsText = getQuestionsText();
        const userInfo = getUserInfo();
        // в качестве названия комнаты будем использовать первый вопрос
        const room = CryptoJS.SHA256(questionsText[0]).toString();
        createChat();

        var socket = io.connect('127.0.0.1:5000')

        socket.on('connect', () => {
            socket.emit('join', room);

            // отправка запроса для счётчика просмотров и создания нового вопроса
            socket.emit('view_question', { 'data': { 'questions': questionsText, 'user_info': userInfo, 'room': room } });
            // получаем сообщения чата
            socket.emit('get_chat', room);
        })

        // событие вызывается при обновлении счётчика просмотров у вопроса
        socket.on('update_viewers', (data) => {
            createViewersInformation(data);
        })

        // событие вызывается при обновлении каких-то ответов на сервере
        socket.on('update_answers', (data) => {
            updateAnswersInformation(data);
        })

        // событие вызывается при получении нового сообщения в чате
        socket.on('add_chat_messages', (messages) => {
            addChatMessages(messages);
        })

        createAnswersInformation();
        setOnChangeListeners();

        console.log(getCurrentAnswers());

        console.info('blocks: ', questionsBlocks);
        console.info('types: ', questionsType);
        console.info('text: ', questionsText);
        console.info('user info: ', userInfo);

        // получаем все выбранные ответы со страницы
        function getCurrentAnswers() {
            let questions = $(questionsBlocks);
            let answers = [];
            for (let i = 0; i < questions.length; i++) {
                let inputElements = $(questions[i]).find('.answer :input');
                for (let j = 0; j < inputElements.length; j++) {
                    answers.push(getAnswer($(inputElements[j]), i));
                }
            }
            return answers;
        }

        // добавляет ко всем инпутам колбэк функцию на изменение
        function setOnChangeListeners() {
            let questions = $(questionsBlocks);
            for (let i = 0; i < questions.length; i++) {
                let inputElements = $(questions[i]).find('.answer :input');
                for (let j = 0; j < inputElements.length; j++) {
                    $(inputElements[j]).on('change', function () {
                        onAnswerChange($(this), i);
                    })
                }
                break;
            }
        }

        // создание чата
        function createChat() {
            const chatInnerHTML = `
                <input type="checkbox" id="chat-button" aria-hidden="true">
                <nav class="chat-nav">
                    <label for="chat-button" class="chat-button" onclick></label>
                    <section>
                        <div id="chat-messages" style="max-height: 700px; overflow-y: scroll; padding-right: 10px;">
                        </div>
                        <div>
                            <textarea id="chat-input" placeholder="Написать сообщение"></textarea>
                            <svg width="33" height="32" viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg" id="send-chat-message-icon">
                                <path d="M28.2758 4.29001C28.1423 4.15569 27.9738 4.06268 27.7898 4.02194C27.6059 3.9812 27.4143 3.99441 27.2376 4.06001L5.48526 12.06C5.29766 12.132 5.13615 12.26 5.02218 12.427C4.90821 12.594 4.84717 12.7921 4.84717 12.995C4.84717 13.1979 4.90821 13.3961 5.02218 13.5631C5.13615 13.7301 5.29766 13.858 5.48526 13.93L13.9786 17.36L20.2472 11L21.6413 12.41L15.343 18.78L18.7443 27.37C18.8176 27.5561 18.9444 27.7156 19.1083 27.8279C19.2723 27.9403 19.4658 28.0002 19.6638 28C19.8636 27.9959 20.0575 27.9306 20.2199 27.8128C20.3823 27.6949 20.5056 27.5301 20.5735 27.34L28.4834 5.34001C28.5508 5.16309 28.567 4.97044 28.5303 4.78454C28.4935 4.59863 28.4052 4.42712 28.2758 4.29001Z" fill="#377DFF"/>
                            </svg>
                        </div>
                    </section>
                </nav>
            `;
            document.body.innerHTML = chatInnerHTML + document.body.innerHTML;
            GM_addStyle(`
                .chat-nav {
                    width: 485px;
                    height: 800px;
                    background: #EFEFEF;
                    box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.25);
                    border-radius: 20px;
                    position: fixed;
                    padding: 0;
                    top: 16.7%;
                    margin-top: -99.7px;
                    right: 0;
                    background: #EFEFEF;;
                    -webkit-transform: translateX(100%);
                    -moz-transform: translateX(100%);
                    transform: translateX(100%);
                    -webkit-transition: 0.34s;
                    -moz-transition: 0.34s;
                    transition: 0.34s;
                    z-index: 9998;
                }
                .chat-nav > section {
                    padding: 15px;
                    color: #8D8D8D
                }
                .chat-button {
                    position: absolute;
                    right: 99.8%;
                    top: 41%;
                    box-shadow: 0px 2px 0px 0px rgb(0 0 0 / 25%);
                    margin-top: -24px;
                    left: -24px;
                    padding: 1em 0;
                    background: inherit;
                    border-bottom-left-radius: 7px;
                    border-top-left-radius: 7px;
                    color: #8D8D8D;
                    font-size: 1.4em;
                    line-height: 1;
                    text-align: center;
                }
                .chat-button:after {
                    content: '<';
                    font: normal 18px/1 'FontAwesome';
                    text-decoration: inherit;
                }
                .chat-button:hover{
                    cursor: pointer;
                    color:#1f1c1c;
                }
                [id='chat-button'] {
                    position: absolute;
                    right:0;
                    display:none;
                }
                [id='chat-button']:checked ~ .chat-nav {
                    -webkit-transform: translateX(0);
                    -moz-transform: translateX(0);
                    transform: translateX(0);
                }
                [id='chat-button']:checked ~ .chat-nav > .chat-button:after {
                    content:'>';
                    font: normal 18px/1 'FontAwesome';
                }
                body {
                    -webkit-animation: bugfix infinite 1s;
                    animation: bugfix infinite 1s;
                }
                @-webkit-keyframes bugfix {
                    to { padding: 0; }
                }
                @media (max-width: 350px) {
                    .chat-nav {
                        width: 100%;
                    }
                }
                .chat-message-text {
                    word-break: break-all;
                    font-size: 18px;
                    line-height: 21px;
                    padding-left: 10px;
                    padding-top: 8px;
                    padding-right: 4px;
                    padding-bottom: 8px;
                    color: #FFFFFF;
                }
                .chat-message {
                    width: 343px;
                    margin-top: 5px;
                }
                .your-chat-message{
                    float: right;
                }
                .chat-message-text-other{
                    color: #363636;
                    left: 15px;
                    background: #FFFFFF;
                    border-radius: 1px 20px 20px 20px;
                    min-height: 45px;
                }
                .chat-message-text-your{
                    right: 15px;
                    background: #377DFF;
                    border-radius: 20px 20px 1px 20px;
                    min-height: 45px;
                    margin-bottom:5px;
                }
                .chat-message-user-type {
                    font-size: 14px;
                    line-height: 16px;
                }
                .other-chat-message-type{
                    left: 15px;
                    color: #B4B4B4;
                    margin-bottom:5px;
                }
                .your-chat-message-type{
                    right: 20px;
                    color: #B4B4B4;
                }
                #chat-input{
                    position: absolute;
                    bottom: 0px;
                    margin-top: 0px;
                    margin-bottom: 5px;
                    width: 462.73px;
                    height: 59px;
                    background: #FFFFFF;
                    resize: none;
                    border-radius: 20px;
                    padding: 5px;
                }
                #chat-input:focus-visible {
                    outline: -webkit-focus-ring-color auto 0px !important;
                }
                #send-chat-message-icon{
                    position: absolute;
                    bottom: 4px;
                    right: 0;
                    margin-bottom: 12px;
                    margin-right: 18px;
                }
                #send-chat-message-icon:hover{
                    cursor: pointer;
                }
                .another-chat-message{
                    float:left;
                }

            `);

            $('#send-chat-message-icon').click(function () {
                let message = $('#chat-input').val();
                if (message != '') {
                    let userName = $('.usertext').text().split(' ')[0];
                    console.log(message);
                    socket.emit('chat', { 'room': room, 'message': { 'user': userName, 'user_info': userInfo, 'text': message } });
                }
                $('#chat-input').val('');
                var d = $('#chat-messages')
                d.scrollTop(d.prop("scrollHeight"));
            });

            $('.chat-button').click(function () {
                var d = $('#chat-messages')
                d.scrollTop(d.prop("scrollHeight"));
            });
        }

        // получение хэша имени юзера
        function getUserInfo() {
            return CryptoJS.SHA256($('.usertext').text()).toString();
        }

        // получение списка всех типов вопросов со страницы
        function getQuestionsType() {
            let typesList = [];
            let questions = $(questionsBlocks);
            for (let i = 0; i < questions.length; i++) {
                // для чекбоксов отдельный тип, т.к. придётся передавать помимо варианта ответа
                // ещё и состояние чекбокса
                if ($($(questions[i]).find('div.answer')).find('input:checkbox').length > 0) {
                    typesList.push(questions[i].classList[1] + '_checkbox');
                }
                else {
                    typesList.push(questions[i].classList[1]);
                }
            }

            return typesList;
        }

        // получение списка текстов всех вопросов со страницы
        function getQuestionsText() {
            let textsList = [];
            let questions = $(questionsBlocks);
            for (let i = 0; i < questions.length; i++) {
                let text;
                if ($(questions[i]).find('.filter_mathjaxloader_equation').length > 0) {
                    text = $(questions[i]).find('.filter_mathjaxloader_equation').text();
                }
                else {
                    text = $(questions[i]).find('.qtext > p').text();
                }

                // возможно такое, что текст вопроса будет одинаковый, но картинки
                // у вопроса различаются. Добавим на всякий случай src от img
                const innerImages = $(questions[i]).find('.qtext > p > img');
                if (innerImages.length > 0) {
                    for (let index = 0; index < innerImages.length; index++) {
                        let image = innerImages[index].currentSrc.split('/')
                        text += " " + decodeURI(image[image.length - 1]);
                    }
                }
                textsList.push(text);
            }

            return textsList;
        }

        // добавляет сообщения в чат
        // параметр message - список сообщений. 
        // Пример: [{'user': 'Max', 'user_info': 'qwr1wt1g233', 'text': 'тестовое сообщение'}, ...]
        function addChatMessages(messages) {
            let chatMessages = $('#chat-messages')

            if (messages != undefined) {
                for (let i = 0; i < messages.length; i++) {
                    let messageHtml = `<div class="chat-message your-chat-message">
                        <p class="chat-message-text chat-message-text-your">${messages[i]['text']}</p>
                        <p class="chat-message-user-type your-chat-message-type your-chat-message">вы</p>
                    </div>`

                    if (messages[i]['user_info'] != userInfo) {
                        messageHtml = `
                            <div class="chat-message another-chat-message">
                                <p class="chat-message-user-type other-chat-message-type">${messages[i]['user']}</p>
                                <p class="chat-message-text chat-message-text-other">${messages[i]['text']}</p>
                            </div>
                            `
                    }

                    chatMessages.append(messageHtml);
                }
            }
        }

        // для каждого вопроса создаёт блок информации о кол-во его просмотров
        function createViewersInformation(data) {
            for (let i = 0; i < data['data'].length; i++) {
                let html = `<div class="script-answer-viewers" style="color: red; padding-left: 5px; position: relative; background: rgb(0 0 0 / 6%); border-radius: 4px;">Просмотров со скриптом: ${data['data'][i]['viewers'].length}</div>`
                for (let j = 0; j < questionsText.length; j++) {
                    if (data['data'][i]['question'] == questionsText[j]) {
                        console.log('+')
                        if ($($('.que')[j]).find('.script-answer-viewers').length > 0) {
                            $($('.que')[j]).find('.script-answer-viewers').innerHTML = html;
                        }
                        else {
                            $($('.que')[j]).find('.formulation').append(html);
                        }
                    }
                }
            }
        }

        // вставка блоков с информацией о выбранных ответах со скриптом
        function createAnswersInformation() {
            let questions = $(questionsBlocks);
            for (let i = 0; i < questions.length; i++) {
                if (questionsType[i] == "shortanswer") {
                    $('<div/>', {
                        "class": 'script-answers',
                        text: 'Текстовые ответы пользователей:',
                        style: 'color: red; padding-left: 5px; position: relative; background: rgb(0 0 0 / 6%); border-radius: 4px;'
                    }).appendTo($('.que').find('.formulation'));
                } else {
                    $('<div/>', {
                        "class": 'script-answers',
                        text: 'Выбрало этот ответ: 0',
                        style: 'color: red; padding-left: 5px; position: relative; width: 120px; background: rgb(0 0 0 / 6%); border-radius: 4px;'
                    }).appendTo($('.que').find('.ml-1').parent());
                }
            }
        }

        // обновление блоков с информацией о выбранных ответах со скриптом
        function updateAnswersInformation(data) {
            let questions = $(questionsBlocks);
            //
        }
        

        // возвращает текст ответа у инпута
        // если у вопроса с индексом index тип такой, в котором input с 
        // radio или checkbox, то возвращает список из двух элементов:
        // [название, состояние выбора (checked)]
        function getAnswer(el, index) {
            if (questionsType[index] == 'multichoice_checkbox') {
                if (el.parent().find('input:checkbox').length > 0) {
                    // текст ответа - состояние (checked (true/false))
                    return [el.parent().find('.ml-1').text(), el.parent().find('input:checkbox').is(':checked')];
                } 
            }
            else if (questionsType[index] == 'shortanswer') {
                return el.val();;
            }
            else if (questionsType[index] == 'multichoice_checkbox' || questionsType[index] == 'multichoice' || questionsType[index] == 'truefalse'){
                // todo: возможно с Latex формулами работать не будет. Стоит проверить
                return [el.parent().find('.ml-1').text(), el.parent().find('input:radio').is(':checked')];
            } 
            else {
                return el.parent().find('.ml-1').text();
            }
        }

        // функция, которая вызывается при изменении какого либо ответа
        // она нужна для отправки ответа на сервер
        function onAnswerChange(el, index) {
            // добавляем свой ответ
            let answerData = getAnswer(el, index);
            // у некоторыъ типов вопросов возвращается 2 состояния: текст ответа и bool (является ли выбранным)
            // для отправки одного ответа нам состояние выбора не нужно, так как это срабатывает априори
            // когда ответ выбран
            if (questionsType[index] != 'multichoice_checkbox' && questionsType[index] != 'shortanswer' && answerData.length == 2){
                answerData = answerData[0]
            }
            console.log('Ответ отправлен: ', questionsType[index], answerData);
            socket.emit('add_answer', {'user_info': userInfo, 'question': questionsText[index], 'question_type': questionsType[index], 'answer': answerData, 'room': room});
        }
    });
})();