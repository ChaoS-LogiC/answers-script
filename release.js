// ==UserScript==
// @name         Mirea Ninja Answers
// @namespace    https://mirea.ninja/
// @version      1.1.2
// @description  online test answers!
// @author       admin
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/Ninja-Official/answers-script/main/release.js
// @downloadURL  https://raw.githubusercontent.com/Ninja-Official/answers-script/main/release.js
// @supportURL   https://mirea.ninja/t/novaya-versiya-skripta-dlya-obmena-otvetami-v-testirovaniya-v-sdo/486
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/crypto-js.min.js
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.1.2/socket.io.min.js
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';
    $(window).ready(function () {
        if (!$(".que").length) return;
        if (document.body.classList.contains("quiz-secure-window")) {
            window.addEventListener("mousedown", function (event) { event.stopPropagation(); }, true);
            window.addEventListener("dragstart", function (event) { event.stopPropagation(); }, true);
            window.addEventListener("contextmenu", function (event) { event.stopPropagation(); }, true);
            window.addEventListener('copy', function (event) { event.stopPropagation(); }, true);
            window.addEventListener('beforeprint', function (event) { event.stopPropagation(); }, true);
        }

        // match - вопрос на соответствие,
        // multichoice - вопрос с множественными вариантами ответов,
        // multichoice_checkbox - множество вариантов, ответить можно несколько
        // shortanswer - вписать короткий ответ,
        // numerical - коротки ответ в виде числа,
        // truefalse - вопрос на верно/неверно
        var questionsBlocks = '.que';
        const questionsType = getQuestionsType();
        const questionsText = getQuestionsText();
        const userInfo = getUserInfo();
        // в качестве названия комнаты будем использовать первый вопрос
        const room = CryptoJS.SHA256(questionsText[0]).toString();
        createChat();

        var socket = io.connect('https://mirea.ninja:5000/')

        socket.on('connect', () => {
            socket.emit('join', room);

            // отправка запроса для счётчика просмотров и создания нового вопроса
            socket.emit('view_question', { 'data': { 'questions': questionsText, 'user_info': userInfo, 'room': room } });
            // получаем сообщения чата
            socket.emit('get_chat', room);
            // отправляем текущие ответы на сервер
            updateAnswersOnDocumentReady();
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
            let chatMessagesBlock = $('#chat-messages');
            chatMessagesBlock.scrollTop(chatMessagesBlock.prop("scrollHeight"));
        })


        createAnswersInformation();
        setOnChangeListeners();
        createApprovalButtons();


        console.info('blocks: ', questionsBlocks);
        console.info('types: ', questionsType);
        console.info('text: ', questionsText);
        console.info('user info: ', userInfo);

        function createApprovalButtons() {
            GM_addStyle(`
              .approval-btn-group {
                display: flex;
                margin-right: 5px;
                float: right;
                clear: both;
              }
              .approval-span-btn {
                font-size: 15px;
              }
              .approval-span-btn:hover {
                cursor: pointer;
              }
              .que.multichoice .answer div.r0, .que.multichoice .answer div.r1 {
                border-bottom: 1px solid #dee2e6 !important;
              }
              .que.truefalse .answer div.r0, .que.truefalse .answer div.r1 {
                border-bottom: 1px solid #dee2e6 !important;
              }
            `);

            let questions = $(questionsBlocks);
            let buttonsHtml = `
            <div class="approval-btn-group" ">
                <span class="approval-span-btn" title="Я уверен(а), что этот ответ правильный">✔</span>
                <span class="approval-span-btn" title="Я уверен(а), что этот ответ неправильный">❌</span>
            </div>
            `
            for (let i = 0; i < questions.length; i++) {
                if (questionsType[i] != 'shortanswer' && questionsType[i] != 'numerical') {
                    let inputElements = $(questions[i]).find('.script-answers');
                    for (let j = 0; j < inputElements.length; j++) {
                        let clickElement = undefined;
                        if (questionsType[i] == 'truefalse') {
                            $(inputElements[j]).parent().append(buttonsHtml);
                            clickElement = $($(inputElements[j]).parent().find('.approval-span-btn'));
                        }
                        else {
                            $(inputElements[j]).parent().parent().append(buttonsHtml);
                            clickElement = $($(inputElements[j]).parent().parent().find('.approval-span-btn'));
                        }
                        clickElement.on('click', function () {
                            approvalAnswers($(this), i);
                        })
                    }
                }
            }
        }

        function approvalAnswers(el, questionIndex) {
            let answer = getAnswer(el.parent(), questionIndex);
            if (questionsType[questionIndex] == 'multichoice_checkbox' || questionsType[questionIndex] == 'multichoice' || questionsType[questionIndex] == 'truefalse') {
                answer = answer[0];
            }
            if (el.text() == '✔') {
                socket.emit('add_approve', { 'user_info': userInfo, 'question': questionsText[questionIndex], 'is_correct': true, 'answer': answer, 'room': room });
            }
            else if (el.text() == '❌') {
                socket.emit('add_approve', { 'user_info': userInfo, 'question': questionsText[questionIndex], 'is_correct': false, 'answer': answer, 'room': room });
            }
        }

        // получаем все выбранные ответы со страницы
        function updateAnswersOnDocumentReady() {
            let questions = $(questionsBlocks);
            for (let i = 0; i < questions.length; i++) {
                let inputElements = $(questions[i]).find('.answer :input');
                for (let j = 0; j < inputElements.length; j++) {
                    let answer = getAnswer($(inputElements[j]), i);
                    if (questionsType[i] == 'numerical' || questionsType[i] == 'shortanswer' || questionsType[i] == 'multichoice_checkbox') {
                        console.log('Ответ отправлен: ', questionsType[i], answer);
                        socket.emit('add_answer', { 'user_info': userInfo, 'question': questionsText[i], 'question_type': questionsType[i], 'answer': answer, 'room': room });
                    }
                    else if (questionsType[i] == 'multichoice' || questionsType[i] == 'truefalse') {
                        if (answer[1] == true) {
                            console.log('Ответ отправлен: ', questionsType[i], answer[0]);
                            socket.emit('add_answer', { 'user_info': userInfo, 'question': questionsText[i], 'question_type': questionsType[i], 'answer': answer[0], 'room': room });
                        }
                    }
                }
            }

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

            let chatMessagesBlock = $('#chat-messages')
            $('#send-chat-message-icon').click(function () {
                let message = $('#chat-input').val();
                if (message != '') {
                    let userName = $('.usertext').text().split(' ')[1];
                    socket.emit('chat', { 'room': room, 'message': { 'user': userName, 'user_info': userInfo, 'text': message } });
                }
                $('#chat-input').val('');
            });

            $('.chat-button').click(function () {
                chatMessagesBlock.scrollTop(chatMessagesBlock.prop("scrollHeight"));
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

        function getBase64Image(img) {
            var canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            var dataURL = canvas.toDataURL("image/png");
            return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
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
                        //let image = innerImages[index].currentSrc.split('/')
                        text += " img:" + innerImages[index].currentSrc;
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
                if (questionsType[i] == "shortanswer" || questionsType[i] == "numerical") {
                    $('<div/>', {
                        "class": 'script-answers',
                        text: 'Текстовые ответы пользователей:',
                        style: 'color: red; padding-left: 5px; position: relative; background: rgb(0 0 0 / 6%); border-radius: 4px;'
                    }).appendTo($($(questionsBlocks)[i]).find('.formulation'));
                } else {
                    let htmlContent = `
                    <div class="script-answers" style="padding-left: 5px; position: relative; display: inline-flex; background: rgb(0 0 0 / 6%); border-radius: 4px; font-size: 15px; max-height: 25px;">
                        ответы: <span title="Выбрали этот ответ" style="margin: 0px 5px;">0</span> | <span style="color: green; margin: 0px 5px;" title="Уверены, что этот ответ правильный">0</span> | <span style="color: red; margin: 0px 5px;" title="Уверены, что этот ответ неправильный">0</span>
                    </div>`;
                    $($(questionsBlocks)[i]).find('.ml-1').parent().append(htmlContent);
                }
            }
        }

        function isAnswerInAnswers(data, answer) {
            for (let i = 0; i < data['answers'].length; i++) {
                if (data['answers'][i]['answer'] == answer)
                    return true;
            }
            return false;
        }

        // обновление блоков с информацией о выбранных ответах со скриптом
        function updateAnswersInformation(data) {
            let questions = $(questionsBlocks);
            // проходимся по всем вопросам на странице
            for (let i = 0; i < questions.length; i++) {
                if (data != undefined) {
                    // если текст вопроса равен тексту вопроса, который нам вернул сервер
                    if (questionsText[i] == data['question']) {
                        if (questionsType[i] != 'shortanswer' && questionsType[i] != 'numerical') {
                            // берём все инпуты у данного вопроса
                            let inputElements = $(questions[i]).find('.answer :input');
                            // проходимся по всем инпутам в вопросе
                            for (let j = 0; j < inputElements.length; j++) {
                                // проходимся по всем вариантам ответа, которые вернул нам сервер
                                let answer = getAnswer($(inputElements[j]), i);
                                // берём только текст ответа, без его состояния
                                if (questionsType[i] == 'multichoice_checkbox' || questionsType[i] == 'multichoice' || questionsType[i] == 'truefalse') {
                                    answer = answer[0];
                                }
                                for (let k = 0; k < data['answers'].length; k++) {

                                    // возможно, что ответ исчез, т.к. его все сняли с выбора,
                                    // в таком случае стоит обнулить у него статистику
                                    if (isAnswerInAnswers(data, answer)) {
                                        let stats = $(inputElements[j]).parent().find('.script-answers > span');
                                        // если вариант ответа равен тому, что вернул нам сервер, то обновляем его статистику
                                        if (data['answers'][k]['answer'] == answer) {
                                            if (stats.length == 3) {
                                                $(stats[0]).text(data['answers'][k]['users'].length);
                                                $(stats[1]).text(data['answers'][k]['correct'].length);
                                                $(stats[2]).text(data['answers'][k]['not_correct'].length);
                                            }
                                            break;
                                        }
                                    }
                                    else {
                                        let stats = $(inputElements[j]).parent().find('.script-answers > span');
                                        if (stats.length == 3) {
                                            $(stats[0]).text('0');
                                            $(stats[1]).text('0');
                                            $(stats[2]).text('0');
                                        }
                                    }
                                }
                            }
                        } else {
                            $(questions[i]).find('.script-answers').html('');
                            for (let j = 0; j < data['answers'].length; j++) {
                                if (data['answers'][j]['answer'] != '') {
                                    if (data['answers'][j]['users'].length != 0) {
                                        let htmlContent = `
                                        <div><span class="user-text-answer" style="color: black; margin: 0px 5px;">${data['answers'][j]['answer']}</span> | <span style="color: black;" title="Выбрали этот ответ" style="margin: 0px 5px;"> ${data['answers'][j]['users'].length} </span></div>
                                        `;
                                        $(questions[i]).find('.script-answers').append(htmlContent);
                                    }
                                }
                            }
                        }

                    }
                }
            }
        }


        // возвращает текст ответа у инпута
        // если у вопроса с индексом index тип такой, в котором input с
        // radio или checkbox, то возвращает список из двух элементов:
        // [название, состояние выбора (checked)]
        // el - .answer :input
        function getAnswer(el, questionIndex) {
            if (questionsType[questionIndex] == 'shortanswer' || questionsType[questionIndex] == "numerical") {
                return el.val();
            }
            else if (questionsType[questionIndex] == 'multichoice_checkbox' || questionsType[questionIndex] == 'multichoice' || questionsType[questionIndex] == 'truefalse') {
                const innerImages = el.parent().find('img');
                let answerText = el.parent().find('.ml-1').text();
                if (innerImages.length > 0) {
                    for (let index = 0; index < innerImages.length; index++) {
                        answerText += " img:" + innerImages[index].currentSrc;
                    }
                }
                // текст ответа - состояние (checked (true/false))
                // todo: возможно с Latex формулами работать не будет. Стоит проверить
                if (el.parent().find('input:checkbox').length > 0) {
                    return [answerText, el.parent().find('input:checkbox').is(':checked')];
                }
                else {
                    return [answerText, el.parent().find('input:radio').is(':checked')];
                }
            }
            else {
                return el.parent().find('.ml-1').text();
            }
        }

        // функция, которая вызывается при изменении какого либо ответа
        // она нужна для отправки ответа на сервер
        function onAnswerChange(el, questionIndex) {
            // добавляем свой ответ
            let answerData = getAnswer(el, questionIndex);
            // у некоторыъ типов вопросов возвращается 2 состояния: текст ответа и bool (является ли выбранным)
            // для отправки одного ответа нам состояние выбора не нужно, так как это срабатывает априори
            // когда ответ выбран
            if (questionsType[questionIndex] != 'multichoice_checkbox' && questionsType[questionIndex] != 'shortanswer' && questionsType[questionIndex] != "numerical" && answerData.length == 2) {
                answerData = answerData[0]
            }
            console.log('Ответ отправлен: ', questionsType[questionIndex], answerData);
            socket.emit('add_answer', { 'user_info': userInfo, 'question': questionsText[questionIndex], 'question_type': questionsType[questionIndex], 'answer': answerData, 'room': room });
        }
    });
})();
